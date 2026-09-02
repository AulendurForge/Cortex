// Static image imports (Next.js handles these at build time; the upper-case
// .PNG extension is not covered by next/image-types/global).
declare module '*.PNG' {
  import type { StaticImageData } from 'next/image';
  const content: StaticImageData;
  export default content;
}
declare module '*.png' {
  import type { StaticImageData } from 'next/image';
  const content: StaticImageData;
  export default content;
}
