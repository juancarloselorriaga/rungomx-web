import { z } from 'zod';
import { AppLocale } from '@/i18n/routing';

const commonSchema = z
  .object({
    loading: z.string(),
    error: z.string(),
    success: z.string(),
    cancel: z.string(),
    save: z.string(),
    delete: z.string(),
    edit: z.string(),
    close: z.string(),
    search: z.string(),
    filter: z.string(),
    sort: z.string(),
    next: z.string(),
    previous: z.string(),
    submit: z.string(),
    brandName: z.string(),
    goHome: z.string(),
    tryAgain: z.string(),
  })
  .strict();

const navigationSchema = z
  .object({
    home: z.string(),
    about: z.string(),
    contact: z.string(),
    events: z.string(),
    news: z.string(),
    results: z.string(),
    help: z.string(),
    dashboard: z.string(),
    profile: z.string(),
    settings: z.string(),
  })
  .strict();

const authSchema = z
  .object({
    signIn: z.string(),
    signUp: z.string(),
    signOut: z.string(),
    email: z.string(),
    password: z.string(),
    rememberMe: z.string(),
    forgotPassword: z.string(),
    noAccount: z.string(),
    hasAccount: z.string(),
    createAccount: z.string(),
    welcome: z.string(),
    welcomeBack: z.string(),
  })
  .strict();

const errorsSchema = z
  .object({
    notFound: z.string(),
    serverError: z.string(),
    unauthorized: z.string(),
    forbidden: z.string(),
    badRequest: z.string(),
    somethingWentWrong: z.string(),
  })
  .strict();

const localeSwitcherSchema = z
  .object({
    label: z.string(),
    locale: z.string(),
  })
  .strict();

const footerSchema = z
  .object({
    sections: z
      .object({
        about: z.string(),
        resources: z.string(),
        legal: z.string(),
        connect: z.string(),
      })
      .strict(),
    links: z
      .object({
        aboutUs: z.string(),
        contact: z.string(),
        helpCenter: z.string(),
        privacy: z.string(),
        terms: z.string(),
      })
      .strict(),
    connectText: z.string(),
    copyright: z.string(),
  })
  .strict();

const themeSwitcherSchema = z
  .object({
    toggleLabel: z.string(),
    light: z.string(),
    dark: z.string(),
    system: z.string(),
  })
  .strict();

const errorBoundarySchema = z
  .object({
    error: z
      .object({
        title: z.string(),
        description: z.string(),
        errorLabel: z.string(),
        digestLabel: z.string(),
      })
      .strict(),
    notFound: z
      .object({
        code: z.string(),
        title: z.string(),
        description: z.string(),
        helpfulLinks: z.string(),
        tips: z.array(z.string()),
        learnAboutUs: z.string(),
      })
      .strict(),
    globalError: z
      .object({
        title: z.string(),
        description: z.string(),
      })
      .strict(),
  })
  .strict();

const componentsSchema = z
  .object({
    Footer: footerSchema,
    ThemeSwitcher: themeSwitcherSchema,
    ErrorBoundary: errorBoundarySchema,
  })
  .strict();

const simplePageSchema = z
  .object({
    title: z.string(),
    description: z.string(),
  })
  .strict();

const aboutPageSchema = z
  .object({
    hero: z
      .object({
        title: z.string(),
        description: z.string(),
      })
      .strict(),
    vision: z
      .object({
        title: z.string(),
        paragraph1: z.string(),
        paragraph2: z.string(),
      })
      .strict(),
    whyWeExist: z
      .object({
        title: z.string(),
        intro: z.string(),
        butText: z.string(),
        problems: z.array(z.string()),
        solution: z.string(),
      })
      .strict(),
    whatWeDo: z
      .object({
        title: z.string(),
        subtitle: z.string(),
        forRunners: z
          .object({
            title: z.string(),
            features: z.array(z.string()),
          })
          .strict(),
        forOrganizers: z
          .object({
            title: z.string(),
            features: z.array(z.string()),
          })
          .strict(),
        tagline: z.string(),
      })
      .strict(),
    philosophy: z
      .object({
        title: z.string(),
        intro: z.string(),
        believeIn: z.string(),
        values: z.array(
          z
            .object({
              title: z.string(),
              description: z.string(),
            })
            .strict()
        ),
      })
      .strict(),
    mexicanTechnology: z
      .object({
        title: z.string(),
        subtitle: z.string(),
        weKnow: z.string(),
        knowledge: z.array(z.string()),
        tagline: z.string(),
      })
      .strict(),
    commitment: z
      .object({
        title: z.string(),
        goals: z.array(z.string()),
        mission: z.string(),
        tagline: z.string(),
      })
      .strict(),
  })
  .strict();

const pagesSchema = z
  .object({
    Home: z
      .object({
        content: z
          .object({
            placeholder: z.string(),
          })
          .strict(),
      })
      .strict(),
    About: aboutPageSchema,
    Contact: simplePageSchema,
    Events: simplePageSchema,
    Help: simplePageSchema,
    News: simplePageSchema,
    Results: simplePageSchema,
    Dashboard: simplePageSchema,
    Profile: simplePageSchema,
    Settings: simplePageSchema,
    Team: simplePageSchema,
    SignIn: simplePageSchema,
    SignUp: simplePageSchema,
  })
  .strict();

export const messagesSchema = z
  .object({
    Common: commonSchema,
    Navigation: navigationSchema,
    Auth: authSchema,
    Errors: errorsSchema,
    LocaleSwitcher: localeSwitcherSchema,
    Components: componentsSchema,
    Pages: pagesSchema,
  })
  .strict();

export type Messages = z.infer<typeof messagesSchema>;

declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
