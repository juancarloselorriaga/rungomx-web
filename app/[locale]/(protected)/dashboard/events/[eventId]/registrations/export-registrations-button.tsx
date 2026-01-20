'use client';

import { exportAddOnSalesCSV, exportRegistrationsCSV } from '@/lib/events/registrations/actions';
import type { RegistrationStatus } from '@/lib/events/constants';
import { Download, FileSpreadsheet, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

type ExportRegistrationsButtonProps = {
  editionId: string;
  distanceId?: string;
  status?: RegistrationStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function ExportRegistrationsButton({
  editionId,
  distanceId,
  status,
  search,
  dateFrom,
  dateTo,
}: ExportRegistrationsButtonProps) {
  const t = useTranslations('pages.eventsRegistrations.export');
  const [isExporting, setIsExporting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const downloadCSV = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportRegistrations = async () => {
    setIsExporting(true);
    setShowMenu(false);
    try {
      const result = await exportRegistrationsCSV({
        editionId,
        distanceId,
        status,
        search,
        dateFrom,
        dateTo,
      });

      if (!result.ok) {
        toast.error(t('error'), { description: result.error });
        return;
      }

      downloadCSV(result.data.csv, result.data.filename);
      toast.success(t('success'));
    } catch {
      toast.error(t('error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAddOns = async () => {
    setIsExporting(true);
    setShowMenu(false);
    try {
      const result = await exportAddOnSalesCSV({ editionId });

      if (!result.ok) {
        toast.error(t('error'), { description: result.error });
        return;
      }

      downloadCSV(result.data.csv, result.data.filename);
      toast.success(t('successAddOns'));
    } catch {
      toast.error(t('error'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setShowMenu(!showMenu)}
        disabled={isExporting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
      >
        <Download className="h-4 w-4" />
        {isExporting ? t('exporting') : t('button')}
      </button>

      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-md border bg-popover p-1 shadow-lg">
            <button
              type="button"
              onClick={handleExportRegistrations}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <div className="text-left">
                <p className="font-medium">{t('registrations')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('registrationsDescription')}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={handleExportAddOns}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <Package className="h-4 w-4" />
              <div className="text-left">
                <p className="font-medium">{t('addOns')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('addOnsDescription')}
                </p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
