import type { ReactNode } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { PricingTiersManager } from '@/app/[locale]/(protected)/dashboard/events/[eventId]/pricing/pricing-tiers-manager';
import type { PricingTierData } from '@/lib/events/pricing/actions';

const refreshMock = jest.fn();

const translations: Record<string, string> = {
  noDistances: 'Sin distancias',
  selectDistance: 'Selecciona distancia',
  title: 'Precios',
  'tier.add': 'Agregar precio',
  'tier.edit': 'Editar',
  'tier.delete': 'Eliminar',
  'tier.defaultLabel': 'General',
  'tier.unnamed': 'Sin nombre',
  'tier.labelField': 'Nombre del precio',
  'tier.labelPlaceholder': 'Ej. Preventa',
  'tier.priceField': 'Precio',
  'tier.pricePlaceholder': '0.00',
  'tier.startsAtField': 'Inicio',
  'tier.startsAtHint': 'Inicio hint',
  'tier.endsAtField': 'Fin',
  'tier.endsAtHint': 'Fin hint',
  'tier.currentTier': 'Actual',
  'tier.upcomingTier': 'Próximo',
  'tier.expiredTier': 'Expirado',
  'tier.from': 'Desde',
  'tier.until': 'Hasta',
  'tier.noDates': 'Sin fechas',
  'tier.emptyState': 'Sin precios',
  'tier.saved': 'Guardado',
  'tier.deleted': 'Eliminado',
  'tier.deleteTitle': 'Eliminar precio',
  'tier.confirmDelete': 'Confirmar eliminación',
  'tier.cannotDeleteLast': 'No se puede eliminar',
  'tier.errorDeleting': 'Error eliminando',
  'tier.errorSaving': 'Error guardando',
  'tier.dateOverlap': 'Fechas traslapadas',
  'help.title': 'Ayuda',
  'help.description': 'Descripción',
};

jest.mock('next-intl', () => ({
  useLocale: () => 'es-MX',
  useTranslations: () => (key: string) => translations[key] ?? key,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/events/pricing/actions', () => ({
  createPricingTier: jest.fn(),
  updatePricingTier: jest.fn(),
  deletePricingTier: jest.fn(),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/form-field', () => ({
  FormField: ({
    label,
    children,
  }: {
    label: string;
    children?: ReactNode;
  }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  ),
}));

jest.mock('@/components/ui/date-time-picker', () => ({
  DateTimePicker: ({
    value,
    onChangeAction,
  }: {
    value: string;
    onChangeAction: (value: string) => void;
  }) => (
    <input
      aria-label="datetime-picker"
      value={value}
      onChange={(event) => onChangeAction(event.target.value)}
    />
  ),
}));

jest.mock('@/components/ui/delete-confirmation-dialog', () => ({
  DeleteConfirmationDialog: () => null,
}));

function buildTier(overrides?: Partial<PricingTierData>): PricingTierData {
  return {
    id: 'tier-1',
    distanceId: 'distance-1',
    label: 'Standard',
    startsAt: null,
    endsAt: null,
    priceCents: 50000,
    currency: 'MXN',
    sortOrder: 0,
    ...overrides,
  };
}

function renderManager(tiers: PricingTierData[]) {
  render(
    <PricingTiersManager
      distances={[
        {
          id: 'distance-1',
          label: '5K',
          distanceValue: '5',
          distanceUnit: 'km',
        },
      ]}
      initialPricingData={[
        {
          distanceId: 'distance-1',
          distanceLabel: '5K',
          currentPriceCents: 50000,
          nextPriceIncrease: null,
          tiers,
        },
      ]}
    />,
  );
}

describe('PricingTiersManager', () => {
  beforeEach(() => {
    refreshMock.mockClear();
  });

  it('shows the localized default tier label in the edit input for persisted Standard tiers', () => {
    renderManager([buildTier({ label: 'Standard' })]);

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.queryByText('Standard')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /General Actual/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    const labelInput = screen.getByLabelText('Nombre del precio') as HTMLInputElement;
    expect(labelInput.value).toBe('General');
    expect(labelInput.value).not.toBe('Standard');
  });

  it('keeps custom tier names unchanged in the organizer edit input', () => {
    renderManager([buildTier({ label: 'VIP Nocturno' })]);

    expect(screen.getByText('VIP Nocturno')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /VIP Nocturno Actual/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    const labelInput = screen.getByLabelText('Nombre del precio') as HTMLInputElement;
    expect(labelInput.value).toBe('VIP Nocturno');
  });
});
