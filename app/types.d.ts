declare module "*.css?url" {
  const content: string;
  export default content;
}

declare namespace JSX {
  interface IntrinsicElements {
    "ui-nav-menu": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    "ui-title-bar": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { title?: string }, HTMLElement>;
  }
}
