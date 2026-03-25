import crypto from 'node:crypto';

import { prisma } from '../prisma';
import { Logger } from '../logger';
import { toError } from '../runtime-guards';

const PAYMENT_AUTHORIZATION_PREFIX = 'enc:v1';

function getPaymentAuthorizationSecret(): string | null {
    const secret = process.env.ENCRYPTION_SECRET;
    if (typeof secret !== 'string' || secret.length < 32) {
        return null;
    }

    return secret;
}

function deriveEncryptionKey(secret: string): Buffer {
    return crypto.createHash('sha256').update(`payment-authorization:${secret}`).digest();
}

function deriveDeterministicIv(secret: string, rawCode: string): Buffer {
    return crypto.createHmac('sha256', `${secret}:payment-authorization:iv`).update(rawCode).digest().subarray(0, 12);
}

function deriveFingerprint(secret: string, rawCode: string): string {
    return crypto.createHmac('sha256', `${secret}:payment-authorization:fingerprint`).update(rawCode).digest('base64url');
}

export function sealPaymentAuthorizationCode(rawCode: string): string {
    if (!rawCode || rawCode.startsWith(`${PAYMENT_AUTHORIZATION_PREFIX}:`)) {
        return rawCode;
    }

    const secret = getPaymentAuthorizationSecret();
    if (!secret) {
        return rawCode;
    }

    const key = deriveEncryptionKey(secret);
    const iv = deriveDeterministicIv(secret, rawCode);
    const fingerprint = deriveFingerprint(secret, rawCode);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`payment-authorization:${fingerprint}`, 'utf8'));

    const ciphertext = Buffer.concat([cipher.update(rawCode, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
        PAYMENT_AUTHORIZATION_PREFIX,
        fingerprint,
        iv.toString('base64url'),
        authTag.toString('base64url'),
        ciphertext.toString('base64url'),
    ].join(':');
}

export function revealPaymentAuthorizationCode(storedCode: string): string {
    if (!storedCode || !storedCode.startsWith(`${PAYMENT_AUTHORIZATION_PREFIX}:`)) {
        return storedCode;
    }

    const secret = getPaymentAuthorizationSecret();
    if (!secret) {
        throw new Error('ENCRYPTION_SECRET is required to decrypt stored payment authorization codes');
    }

    const encodedPayload = storedCode.slice(`${PAYMENT_AUTHORIZATION_PREFIX}:`.length);
    const [fingerprint, ivPart, tagPart, cipherPart] = encodedPayload.split(':');
    if (!fingerprint || !ivPart || !tagPart || !cipherPart) {
        throw new Error('Stored payment authorization code has invalid format');
    }

    const key = deriveEncryptionKey(secret);
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAAD(Buffer.from(`payment-authorization:${fingerprint}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(cipherPart, 'base64url')),
        decipher.final(),
    ]);

    return plaintext.toString('utf8');
}

export async function persistReusablePaymentAuthorization(params: {
    provider: string;
    userId: string;
    customerId?: string | null;
    authorizationCode: string;
    reusable: boolean;
    channel?: string | null;
    brand?: string | null;
    bank?: string | null;
    last4?: string | null;
    expMonth?: string | null;
    expYear?: string | null;
}): Promise<void> {
    const sealedAuthorizationCode = sealPaymentAuthorizationCode(params.authorizationCode);

    const existing = await prisma.paymentAuthorization.findFirst({
        where: {
            provider: params.provider,
            OR: [
                { authorizationCode: params.authorizationCode },
                { authorizationCode: sealedAuthorizationCode },
            ],
        },
        select: { id: true },
    });

    const data = {
        userId: params.userId,
        provider: params.provider,
        customerId: params.customerId ?? null,
        authorizationCode: sealedAuthorizationCode,
        reusable: params.reusable === true,
        channel: params.channel ?? null,
        brand: params.brand ?? null,
        bank: params.bank ?? null,
        last4: params.last4 ?? null,
        expMonth: params.expMonth ?? null,
        expYear: params.expYear ?? null,
    };

    if (existing?.id) {
        await prisma.paymentAuthorization.update({
            where: { id: existing.id },
            data,
        });
        return;
    }

    await prisma.paymentAuthorization.create({ data });
}

export async function findReusablePaymentAuthorizationCode(params: {
    provider: string;
    userId: string;
    customerId?: string | null;
}): Promise<string | null> {
    const baseWhere = {
        userId: params.userId,
        provider: params.provider,
        reusable: true,
    };

    const exactMatch = params.customerId
        ? await prisma.paymentAuthorization.findFirst({
            where: {
                ...baseWhere,
                customerId: params.customerId,
            },
            orderBy: { updatedAt: 'desc' },
            select: { authorizationCode: true },
        })
        : null;

    const fallbackMatch = exactMatch ?? await prisma.paymentAuthorization.findFirst({
        where: {
            ...baseWhere,
            customerId: null,
        },
        orderBy: { updatedAt: 'desc' },
        select: { authorizationCode: true },
    });

    if (!fallbackMatch?.authorizationCode) {
        return null;
    }

    try {
        return revealPaymentAuthorizationCode(fallbackMatch.authorizationCode);
    } catch (err) {
        Logger.error('Failed to decrypt stored payment authorization code', {
            provider: params.provider,
            userId: params.userId,
            customerId: params.customerId ?? null,
            error: toError(err).message,
        });
        return null;
    }
}