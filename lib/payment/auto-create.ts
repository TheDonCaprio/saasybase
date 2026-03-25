function isTruthyEnv(value: string | undefined) {
  return value === '1' || value === 'true';
}

export function isPaymentCatalogAutoCreateEnabled(providerNames: string[] = []) {
  if (isTruthyEnv(process.env.PAYMENT_AUTO_CREATE)) {
    return true;
  }

  for (const providerName of providerNames) {
    const providerKey = providerName.toUpperCase();
    if (isTruthyEnv(process.env[`${providerKey}_AUTO_CREATE`])) {
      return true;
    }
  }

  return false;
}

export { isTruthyEnv };