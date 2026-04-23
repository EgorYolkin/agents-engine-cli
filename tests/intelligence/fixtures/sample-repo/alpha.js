import path from "node:path";

export function alpha(name) {
  return `hello ${name}`;
}

export class AlphaService {
  run() {
    return alpha(path.basename("world"));
  }
}

const internalValue = 42;
