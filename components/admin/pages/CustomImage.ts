// Re-export the real implementation from the .tsx file so imports that
// resolve to './CustomImage' continue to work. This file exists only to
// provide a .ts module surface for tooling that prefers .ts resolution.
// Re-export the implementation from CustomImageImpl so imports of
// './CustomImage' resolve consistently.
export { CustomImage } from './CustomImageImpl';