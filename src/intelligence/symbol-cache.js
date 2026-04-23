const symbolCache = new Map();

export function getCachedSymbols(filePath, mtimeMs) {
  const cached = symbolCache.get(filePath);
  if (!cached || cached.mtimeMs !== mtimeMs) return null;
  return cached.symbols;
}

export function setCachedSymbols(filePath, mtimeMs, symbols) {
  symbolCache.set(filePath, {
    mtimeMs,
    symbols,
  });
  return symbols;
}

export function clearSymbolCache() {
  symbolCache.clear();
}
