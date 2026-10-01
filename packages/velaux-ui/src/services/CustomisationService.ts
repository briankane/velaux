import type { Terminology } from '../utils/terminology';
import { applyTerminology } from '../utils/terminology';

// Customisation is how this VelaUX is branded, kept in the vela-system
// velaux-configuration ConfigMap.
export interface Customisation {
  // pageTitle is the browser tab's title.
  pageTitle?: string;
  logoURL?: string;
  iconURL?: string;
  // sidebarColor and accentColor are hex colours for the sidebar's background
  // and its current page and highlights.
  sidebarColor?: string;
  accentColor?: string;
  terminology?: Terminology;
}

type Listener = (c: Customisation) => void;

// customisationService holds the branding read from the server: the logo, and
// the terminology every translated string passes through. It imports no API
// code, as i18n reads it and the request layer imports i18n.
class CustomisationService {
  private current: Customisation = {};
  private listeners: Listener[] = [];
  // defaultTitle is the tab's title as the page set it.
  private defaultTitle = typeof document !== 'undefined' ? document.title : '';

  get(): Customisation {
    return this.current;
  }

  set(c: Customisation) {
    this.current = c;
    if (typeof document !== 'undefined') {
      document.title = c.pageTitle || this.defaultTitle;
    }
    this.listeners.forEach((l) => l(c));
  }

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  // translate renames the customised terms in a translated string.
  translate(text: string): string {
    return applyTerminology(text, this.current.terminology || {});
  }
}

export const customisationService = new CustomisationService();

// terminologyPostProcessor passes every i18next translation through the
// customised terminology.
export const terminologyPostProcessor = {
  type: 'postProcessor' as const,
  name: 'terminology',
  process: (value: string) => (typeof value === 'string' ? customisationService.translate(value) : value),
};
