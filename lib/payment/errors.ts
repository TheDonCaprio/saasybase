export class PaymentError extends Error {
    code: string;
    originalError?: unknown;

    constructor(message: string, code: string, originalError?: unknown) {
        super(message);
        this.name = 'PaymentError';
        this.code = code;
        this.originalError = originalError;
    }
}

export class PaymentProviderError extends PaymentError {
    constructor(message: string, originalError?: unknown) {
        super(message, 'PROVIDER_ERROR', originalError);
        this.name = 'PaymentProviderError';
    }
}

export class WebhookSignatureVerificationError extends PaymentError {
    constructor(message: string = 'Invalid webhook signature') {
        super(message, 'WEBHOOK_SIGNATURE_INVALID');
        this.name = 'WebhookSignatureVerificationError';
    }
}

export class ConfigurationError extends PaymentError {
    constructor(message: string) {
        super(message, 'CONFIGURATION_ERROR');
        this.name = 'ConfigurationError';
    }
}
