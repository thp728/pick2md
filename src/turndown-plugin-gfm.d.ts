// turndown-plugin-gfm ships no type declarations; declare the bits we use.
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export type Plugin = TurndownService.Plugin;
  export const gfm: Plugin;
  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
}
