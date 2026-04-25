export function successResult(message) {
  return { handled: true, message };
}

export function renderedResult() {
  return { handled: true, rendered: true };
}

export function errorResult(message, i18n) {
  return {
    handled: true,
    message: `${i18n.t("commands.messages.errorPrefix")} ${message}`,
  };
}
