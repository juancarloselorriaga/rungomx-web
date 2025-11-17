import { siteUrl } from '@/config/url';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sobre SprintMX | Quiénes somos y qué hacemos',
  description:
    'Conoce SprintMX: la plataforma mexicana diseñada para corredores y organizadores. Descubre cómo ayudamos a gestionar carreras, inscripciones, resultados, rankings y marketing deportivo en todo México.',
  keywords: [
    'qué es SprintMX',
    'sobre SprintMX',
    'plataforma de carreras México',
    'gestión de eventos deportivos',
    'organizar carreras México',
    'inscripciones en línea México',
    'resultados de carreras México',
    'tecnología para carreras',
  ],
  openGraph: {
    title: 'Sobre SprintMX | Quiénes somos y qué hacemos',
    description:
      'SprintMX es la plataforma mexicana que conecta corredores, organizadores y comunidades deportivas. Conoce nuestra misión, visión y tecnología detrás de las carreras en México.',
    url: `${siteUrl}/about`,
    images: [
      {
        url: `${siteUrl}/og-about.jpg`,
        width: 1200,
        height: 630,
        alt: 'SprintMX - Plataforma de carreras en México',
      },
    ],
  },
};

const AboutPage = () => {
  return (
    <div className=" bg-gradient-to-b from-background to-muted/30 w-full ">
      {/* Hero Section */}
      <section
        className="relative overflow-hidden bg-gradient-to-br from-[var(--brand-blue)] via-[var(--brand-blue-dark)] to-[var(--brand-indigo)] py-20 text-primary-foreground">
        <div className="container relative mx-auto max-w-4xl px-4">
          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            Quiénes somos
          </h1>
          <p className="text-xl leading-relaxed opacity-90 md:text-2xl">
            SprintMX es la plataforma mexicana diseñada para conectar a corredores, organizadores y
            comunidades deportivas en un solo lugar. Nacimos con una misión sencilla: hacer que
            organizar y descubrir carreras en México sea más fácil, más profesional y más accesible
            para todos.
          </p>
        </div>
      </section>

      {/* Vision Section */}
      <section className="py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="rounded-2xl bg-card p-8 shadow-lg ring-1 ring-border md:p-12">
            <h2 className="mb-6 text-3xl font-bold text-foreground">Nuestra visión</h2>
            <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
              <p>
                Que cualquier persona —desde un club local hasta un organizador de maratones— pueda
                crear eventos de calidad internacional sin complicaciones técnicas, herramientas
                fragmentadas o procesos manuales.
              </p>
              <p>
                Y que los corredores tengan un lugar confiable donde encontrar las mejores carreras
                del país, inscribirse en segundos y llevar un historial claro de sus resultados y
                progreso.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why We Exist Section */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">Por qué existimos</h2>
          <div className="mb-8 text-lg leading-relaxed text-muted-foreground">
            <p className="mb-4">
              El running en México está viviendo un momento increíble: más carreras, más
              deportistas, más clubes, más pasión.
            </p>
            <p className="font-medium text-foreground">
              Pero la tecnología que sostiene a la comunidad no siempre está a la altura:
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              'Sitios complicados para inscribirse',
              'Pagos inseguros o confusos',
              'Resultados dispersos o lentos',
              'Zero data para organizadores',
              'Herramientas de marketing mínimas',
              'Sistemas que no hablan entre ellos',
            ].map((problem, index) => (
              <div
                key={index}
                className="flex items-start space-x-3 rounded-lg bg-card p-4 shadow-sm ring-1 ring-border"
              >
                <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-destructive"></div>
                <p className="text-muted-foreground">{problem}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-xl bg-[var(--brand-blue)] p-6 text-center">
            <p className="text-xl font-semibold text-primary-foreground">
              SprintMX llega para resolver eso.
            </p>
          </div>
        </div>
      </section>

      {/* What We Do Section */}
      <section className="py-16">
        <div className="container mx-auto max-w-6xl px-4">
          <h2 className="mb-12 text-center text-3xl font-bold text-foreground">Qué hacemos</h2>
          <p className="mb-12 text-center text-xl text-muted-foreground">
            Creamos un ecosistema completo para el running en México:
          </p>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* For Runners */}
            <div
              className="rounded-2xl bg-gradient-to-br from-[var(--brand-green)]/10 to-[var(--brand-green)]/5 p-8 shadow-lg ring-1 ring-[var(--brand-green)]/20">
              <h3 className="mb-6 text-2xl font-bold text-foreground">Para corredores</h3>
              <ul className="space-y-4">
                {[
                  'Descubre carreras en tu ciudad y en todo el país',
                  'Inscríbete fácil, rápido y con pago seguro',
                  'Consulta tus resultados y registros anteriores',
                  'Lleva tu ranking personal y comparativos',
                  'Recibe información clara antes y después de cada evento',
                ].map((feature, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <svg
                      className="mt-1 h-5 w-5 flex-shrink-0 text-[var(--brand-green)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* For Organizers */}
            <div
              className="rounded-2xl bg-gradient-to-br from-[var(--brand-blue)]/10 to-[var(--brand-indigo)]/5 p-8 shadow-lg ring-1 ring-[var(--brand-blue)]/20">
              <h3 className="mb-6 text-2xl font-bold text-foreground">Para organizadores</h3>
              <ul className="space-y-4">
                {[
                  'Inscripciones en línea con cobros inmediatos',
                  'Panel de control completo para gestionar corredores',
                  'Resultados, fotos, rankings y tiempos',
                  'Herramientas de marketing integradas (emails, cupones, referidos, etc.)',
                  'Sitio web del evento listo sin programar',
                  'Reportes financieros claros y exportables',
                ].map((feature, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <svg
                      className="mt-1 h-5 w-5 flex-shrink-0 text-[var(--brand-blue)]"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-xl font-semibold text-foreground">
              Una sola plataforma para todo el ciclo de vida de tu carrera.
            </p>
          </div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className="bg-gradient-to-br from-foreground to-foreground/90 py-16 text-background">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="mb-8 text-3xl font-bold">Nuestra filosofía</h2>
          <p className="mb-8 text-xl leading-relaxed opacity-90">
            México tiene talento, tiene pasión por correr, y tiene organizadores increíbles. Lo que
            faltaba era una herramienta que estuviera a su nivel.
          </p>

          <div className="mb-4 text-lg font-semibold">Creemos en:</div>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              {
                title: 'simplicidad',
                description: 'que puedas lanzar un evento en minutos',
              },
              {
                title: 'transparencia',
                description: 'datos reales y reportes claros',
              },
              {
                title: 'calidad',
                description: 'una experiencia moderna para todos',
              },
              {
                title: 'comunidad',
                description: 'apoyar a clubes, equipos y atletas locales',
              },
              {
                title: 'innovación',
                description: 'actualizar el running mexicano con tecnología del 2025',
              },
            ].map((value, index) => (
              <div
                key={index}
                className="rounded-lg bg-background/10 p-6 backdrop-blur-sm ring-1 ring-background/20"
              >
                <h3 className="mb-2 text-lg font-bold text-[var(--brand-blue)]">{value.title}</h3>
                <p className="opacity-90">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mexican Technology Section */}
      <section className="py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <div
            className="rounded-2xl bg-gradient-to-br from-[var(--brand-green)] to-[var(--brand-green-dark)] p-8 text-primary-foreground shadow-xl md:p-12">
            <h2 className="mb-6 text-3xl font-bold">
              Somos tecnología mexicana para el running mexicano
            </h2>
            <p className="mb-6 text-xl leading-relaxed opacity-90">
              SprintMX se construye desde cero en México, para el ecosistema deportivo de México.
            </p>

            <div className="mb-4 font-semibold">Conocemos:</div>
            <ul className="mb-6 space-y-2 opacity-90">
              {[
                'cómo se organizan las carreras aquí',
                'cómo se inscriben los corredores',
                'qué necesitan los organizadores',
                'qué esperan los patrocinadores',
                'qué frustra y qué emociona al corredor mexicano',
              ].map((item, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <span className="mt-1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className="text-lg font-medium">
              No copiamos, adaptamos el modelo global al contexto mexicano con calidad
              internacional.
            </p>
          </div>
        </div>
      </section>

      {/* Commitment Section */}
      <section className="bg-muted/50 py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="mb-8 text-3xl font-bold text-foreground">Nuestro compromiso</h2>
          <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
            <p>Queremos elevar el estándar del running nacional.</p>
            <p>Darles a los corredores la experiencia que merecen.</p>
            <p>
              Darles a los organizadores herramientas que les ahorren tiempo, dinero y dolores de
              cabeza.
            </p>
            <p>Y construir una comunidad más conectada, más grande y más fuerte.</p>
          </div>

          <div
            className="mt-12 rounded-xl bg-gradient-to-r from-[var(--brand-blue)] to-[var(--brand-indigo)] p-8 text-center shadow-xl">
            <p className="mb-4 text-2xl font-bold text-primary-foreground">
              Estamos aquí para ser la plataforma que impulsa el crecimiento del running en México
              para los próximos 10 años.
            </p>
            <p className="text-3xl font-bold opacity-90">
              SprintMX — corre mejor, organiza mejor, conecta mejor.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
