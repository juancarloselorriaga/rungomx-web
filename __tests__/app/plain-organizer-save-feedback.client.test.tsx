import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FaqManager } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/faq/faq-manager';
import { AddOnsManager } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/add-ons/add-ons-manager';
import { DistanceItem } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/settings/event-settings-form';
import {
  updateFaqItem,
  updateDistance,
  updateDistancePrice,
} from '@/lib/events/actions';
import { updateAddOnOption } from '@/lib/events/add-ons/actions';
import { toast } from 'sonner';

const routerRefreshMock = jest.fn();

const translations: Record<string, Record<string, string>> = {
  'pages.dashboardEvents.faq': {
    questionLabel: 'Pregunta',
    answerLabel: 'Respuesta',
    save: 'Guardar',
    saving: 'Guardando...',
    saved: 'Pregunta guardada',
    cancel: 'Cancelar',
    addAnother: 'Agregar otra pregunta',
    'actions.edit': 'Editar',
    'actions.delete': 'Eliminar',
    'actions.moveUp': 'Subir',
    'actions.moveDown': 'Bajar',
  },
  'pages.dashboardEvents.addOns': {
    'status.active': 'Activo',
    'status.inactive': 'Inactivo',
    'types.merch': 'Artículo',
    'delivery.pickup': 'Recoger en Evento',
    'option.title': 'Opciones',
    'option.add': 'Agregar opción',
    'option.edit': 'Editar opción',
    'option.delete': 'Eliminar opción',
    'option.save': 'Guardar opción',
    'option.saving': 'Guardando...',
    'option.saved': 'Opción guardada',
    'option.errorSaving': 'Error al guardar opción',
    'option.emptyState': 'Sin opciones',
    'option.count': '1 opción',
    'option.labelField': 'Etiqueta',
    'option.labelPlaceholder': 'Etiqueta',
    'option.priceField': 'Precio',
    'option.pricePlaceholder': '0.00',
    'option.maxQtyField': 'Cantidad máxima por orden',
    'option.maxQtySummary': '(máx. 2 por orden)',
    'option.activeField': 'Activo',
    'option.cancel': 'Cancelar',
    'addOn.edit': 'Editar extra',
    'addOn.delete': 'Eliminar extra',
  },
  'pages.dashboardEventSettings.distances': {
    labelField: 'Etiqueta',
    distanceValue: 'Distancia (km)',
    terrain: 'Terreno',
    price: 'Precio (MXN)',
    capacity: 'Capacidad',
    unlimited: 'Ilimitado',
    registered: 'inscritos',
    save: 'Guardar',
    saving: 'Guardando...',
    saved: 'Distancia guardada',
    errorSaving: 'Error al guardar distancia',
    cancel: 'Cancelar',
    deleteTitle: 'Eliminar distancia',
    confirmDelete: 'Eliminar distancia',
    'terrainTypes.road': 'Asfalto',
    'terrainTypes.trail': 'Trail',
    'terrainTypes.mixed': 'Mixto',
  },
  'pages.dashboardEventSettings.capacity': {
    sharedPoolHint: 'Cupo compartido',
    sharedPoolTag: 'Cupo compartido',
  },
  common: {
    edit: 'Editar',
    delete: 'Eliminar',
  },
};

function getTranslationValue(namespace: string, key: string) {
  return translations[namespace]?.[key] ?? key;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => getTranslationValue(namespace, key),
  useLocale: () => 'es',
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

jest.mock('lucide-react', () => {
  const React = require('react');

  return new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        const Icon = (props: React.ComponentProps<'svg'>) =>
          React.createElement('svg', { ...props, 'data-icon': prop });
        Icon.displayName = prop;
        return Icon;
      },
    },
  );
});

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/events/actions', () => ({
  createFaqItem: jest.fn(),
  updateFaqItem: jest.fn(),
  deleteFaqItem: jest.fn(),
  reorderFaqItems: jest.fn(),
  updateEventEdition: jest.fn(),
  updateEventVisibility: jest.fn(),
  setRegistrationPaused: jest.fn(),
  createDistance: jest.fn(),
  updateDistance: jest.fn(),
  deleteDistance: jest.fn(),
  updateDistancePrice: jest.fn(),
  checkSlugAvailability: jest.fn(),
  confirmEventMediaUpload: jest.fn(),
  updateEventCapacitySettings: jest.fn(),
}));

jest.mock('@/lib/events/add-ons/actions', () => ({
  createAddOn: jest.fn(),
  updateAddOn: jest.fn(),
  deleteAddOn: jest.fn(),
  createAddOnOption: jest.fn(),
  updateAddOnOption: jest.fn(),
  deleteAddOnOption: jest.fn(),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, type = 'button', ...props }: React.ComponentProps<'button'>) => (
    <button type={type} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/icon-button', () => ({
  IconButton: ({
    children,
    label,
    type = 'button',
    ...props
  }: React.ComponentProps<'button'> & { label: string }) => (
    <button aria-label={label} type={type} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/icon-tooltip-button', () => ({
  IconTooltipButton: ({
    children,
    label,
    type = 'button',
    ...props
  }: React.ComponentProps<'button'> & { label: string }) => (
    <button aria-label={label} type={type} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/form-field', () => ({
  FormField: ({
    children,
    label,
  }: {
    children?: React.ReactNode;
    label?: string;
  }) => (
    <label>
      {label ? <span>{label}</span> : null}
      {children}
    </label>
  ),
}));

jest.mock('@/components/ui/markdown-field', () => ({
  MarkdownField: ({
    label,
    value,
    onChange,
    disabled,
    textareaProps,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    textareaProps?: React.TextareaHTMLAttributes<HTMLTextAreaElement>;
  }) => (
    <label>
      <span>{label}</span>
      <textarea
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        {...textareaProps}
      />
    </label>
  ),
}));

jest.mock('@/components/markdown/markdown-content', () => ({
  MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

jest.mock('@/components/ui/delete-confirmation-dialog', () => ({
  DeleteConfirmationDialog: () => null,
}));

jest.mock('@/components/ui/date-picker', () => ({
  DatePicker: () => null,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) => children ?? null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => children ?? null,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => children ?? null,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => children ?? null,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => children ?? null,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: () => null,
}));

jest.mock('@/lib/forms', () => ({
  Form: ({ children }: { children?: React.ReactNode }) => children ?? null,
  FormError: () => null,
  useForm: jest.fn(),
}));

jest.mock('next/dynamic', () => () => {
  const MockDynamicComponent = () => null;
  MockDynamicComponent.displayName = 'MockDynamicComponent';
  return MockDynamicComponent;
});

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@vercel/blob/client', () => ({
  upload: jest.fn(),
}));

describe('plain organizer save feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows FAQ save success, exposes Guardando..., and closes the editor after success', async () => {
    const deferred = createDeferred<{
      ok: true;
      data: { question: string; answer: string; sortOrder: number };
    }>();
    (updateFaqItem as jest.Mock).mockReturnValue(deferred.promise);

    render(
      <FaqManager
        eventId="evt-1"
        initialFaqItems={[
          { id: 'faq-1', question: '¿Qué incluye?', answer: 'Kit básico', sortOrder: 0 },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByDisplayValue('¿Qué incluye?'), {
      target: { value: '¿Qué incluye la inscripción?' },
    });
    fireEvent.change(screen.getByLabelText('Respuesta'), {
      target: { value: 'Kit, medalla y número.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled();

    deferred.resolve({
      ok: true,
      data: {
        question: '¿Qué incluye la inscripción?',
        answer: 'Kit, medalla y número.',
        sortOrder: 0,
      },
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Pregunta guardada');
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('¿Qué incluye la inscripción?')).toBeInTheDocument();
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it('shows add-on option save success and replaces spinner-only pending state with Guardando...', async () => {
    const deferred = createDeferred<{
      ok: true;
      data: { id: string; label: string; priceCents: number; maxQtyPerOrder: number; isActive: boolean };
    }>();
    (updateAddOnOption as jest.Mock).mockReturnValue(deferred.promise);

    render(
      <AddOnsManager
        editionId="evt-1"
        distances={[{ id: 'dist-1', label: '10K' }]}
        initialAddOns={[
          {
            id: 'addon-1',
            editionId: 'evt-1',
            title: 'Playera oficial',
            description: null,
            type: 'merch',
            deliveryMethod: 'pickup',
            distanceId: null,
            isActive: true,
            sortOrder: 0,
            options: [
              {
                id: 'opt-1',
                addOnId: 'addon-1',
                label: 'Chica',
                priceCents: 25000,
                maxQtyPerOrder: 2,
                optionMeta: null,
                isActive: true,
                sortOrder: 0,
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Playera oficial/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar opción' }));
    fireEvent.change(screen.getByDisplayValue('Chica'), {
      target: { value: 'Mediana' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar opción' }));

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled();

    deferred.resolve({
      ok: true,
      data: {
        id: 'opt-1',
        label: 'Mediana',
        priceCents: 25000,
        maxQtyPerOrder: 2,
        isActive: true,
      },
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Opción guardada');
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Guardar opción' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Mediana')).toBeInTheDocument();
    expect(routerRefreshMock).toHaveBeenCalled();
  });

  it('keeps the distance editor open and shows an error toast when the price save fails', async () => {
    (updateDistance as jest.Mock).mockResolvedValue({
      ok: true,
      data: {},
    });
    (updateDistancePrice as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'price failed',
    });

    const onUpdate = jest.fn();

    render(
      <DistanceItem
        distance={{
          id: 'dist-1',
          label: '10K',
          distanceValue: '10',
          distanceUnit: 'km',
          kind: 'distance',
          startTimeLocal: null,
          timeLimitMinutes: null,
          terrain: 'road',
          isVirtual: false,
          capacity: 200,
          capacityScope: 'per_distance',
          sortOrder: 0,
          priceCents: 50000,
          currency: 'MXN',
          hasPricingTier: true,
          pricingTierCount: 1,
          hasBoundedPricingTier: false,
          registrationCount: 0,
        }}
        isEditing
        sharedCapacityEnabled={false}
        onEdit={jest.fn()}
        onCancelEdit={jest.fn()}
        onUpdate={onUpdate}
        onDelete={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('500.00'), {
      target: { value: '550.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error al guardar distancia');
    });
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('shows Guardando... for distance saves and only closes after both mutations succeed', async () => {
    const distanceDeferred = createDeferred<{ ok: true; data: {} }>();
    const priceDeferred = createDeferred<{ ok: true; data: {} }>();
    (updateDistance as jest.Mock).mockReturnValue(distanceDeferred.promise);
    (updateDistancePrice as jest.Mock).mockReturnValue(priceDeferred.promise);

    const onUpdate = jest.fn();

    render(
      <DistanceItem
        distance={{
          id: 'dist-1',
          label: '10K',
          distanceValue: '10',
          distanceUnit: 'km',
          kind: 'distance',
          startTimeLocal: null,
          timeLimitMinutes: null,
          terrain: 'road',
          isVirtual: false,
          capacity: 200,
          capacityScope: 'per_distance',
          sortOrder: 0,
          priceCents: 50000,
          currency: 'MXN',
          hasPricingTier: true,
          pricingTierCount: 1,
          hasBoundedPricingTier: false,
          registrationCount: 0,
        }}
        isEditing
        sharedCapacityEnabled={false}
        onEdit={jest.fn()}
        onCancelEdit={jest.fn()}
        onUpdate={onUpdate}
        onDelete={jest.fn()}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('500.00'), {
      target: { value: '575.00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled();

    distanceDeferred.resolve({ ok: true, data: {} });
    await waitFor(() => {
      expect(updateDistancePrice).toHaveBeenCalledWith({
        distanceId: 'dist-1',
        priceCents: 57500,
      });
    });

    expect(onUpdate).not.toHaveBeenCalled();

    priceDeferred.resolve({ ok: true, data: {} });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Distancia guardada');
    });
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });
  });
});
