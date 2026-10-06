declare module "*.css?url" {
  const content: string;
  export default content;
}

declare namespace JSX {
  interface IntrinsicElements {
    "ui-nav-menu": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}
