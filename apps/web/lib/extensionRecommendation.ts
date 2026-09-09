const chromeExtensionIdPattern = /^[a-p]{32}$/;

export function getChromeExtensionId(value: string | undefined) {
  return value && chromeExtensionIdPattern.test(value) ? value : undefined;
}
