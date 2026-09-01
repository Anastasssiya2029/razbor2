import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useLogout, useListDiagnostics, getListDiagnosticsQueryKey, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AppBrand } from './brand';
import { useAuth } from './auth-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Checkbox } from './ui/checkbox';

/**
 * Lets the user pick which clients' answers to include, then downloads a single combined Excel workbook.
 * Controlled from the parent so it stays mounted (and keeps its state) even when the menu that triggered it closes.
 */
function ExportAnswersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const setOpen = onOpenChange;
  const { data: diagnostics, isLoading } = useListDiagnostics({ query: { enabled: open, queryKey: getListDiagnosticsQueryKey() } });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sorted = useMemo(
    () => [...(diagnostics ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [diagnostics],
  );

  useEffect(() => {
    if (open) setSelectedIds(new Set(sorted.map((item) => item.diagnosticId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, diagnostics]);

  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(sorted.map((item) => item.diagnosticId)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDownload = () => {
    if (selectedIds.size === 0) return;
    const url = `/api/diagnostics/answers.xlsx?ids=${[...selectedIds].join(',')}`;
    window.location.assign(url);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Выгрузить ответы в Excel</DialogTitle>
          <DialogDescription>Отметьте, чьи анкеты включить в файл. Каждый выбранный клиент попадёт в свою колонку.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="admin-empty">Загружаю список разборов…</p>
        ) : sorted.length === 0 ? (
          <p className="admin-empty">Разборов пока нет.</p>
        ) : (
          <div className="export-answers-list">
            <label className="export-answers-row export-answers-row-all">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              <span>Выбрать всех ({sorted.length})</span>
            </label>
            {sorted.map((item) => (
              <label className="export-answers-row" key={item.diagnosticId}>
                <Checkbox checked={selectedIds.has(item.diagnosticId)} onCheckedChange={() => toggleOne(item.diagnosticId)} />
                <span>
                  <strong>{item.client?.displayName ?? 'Неизвестный клиент'}</strong>
                  <small>{format(new Date(item.createdAt), 'd MMMM yyyy, HH:mm', { locale: ru })}</small>
                </span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <button type="button" className="admin-button" onClick={() => setOpen(false)}>Отмена</button>
          <button type="button" className="admin-button primary" onClick={handleDownload} disabled={selectedIds.size === 0}>
            Скачать ({selectedIds.size})
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Top navigation shared by the cabinet (dashboard/analysis) screens: brand, page-specific actions, and a hamburger menu. */
export function CabinetNav({ extra }: { extra?: React.ReactNode }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [open]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        setLocation('/login');
      },
    });
  };

  return (
    <header className="admin-header">
      <AppBrand />
      <nav className="admin-actions" aria-label="Действия кабинета">
        {extra}
        <div className="header-menu" ref={menuRef}>
          <button
            type="button"
            className="header-menu-trigger"
            aria-label="Открыть меню"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <HamburgerIcon />
          </button>
          {open && (
            <div className="header-menu-popover" role="menu">
              <Link role="menuitem" href="/" onClick={() => setOpen(false)}>Новый разбор</Link>
              <Link role="menuitem" href="/diagnostics" onClick={() => setOpen(false)}>Мои разборы</Link>
              <button type="button" role="menuitem" onClick={() => { setOpen(false); setExportOpen(true); }}>Выгрузить Excel</button>
              {user?.role !== 'manager' && (
                <Link role="menuitem" href="/team" onClick={() => setOpen(false)}>Менеджеры</Link>
              )}
              <button className="danger" type="button" role="menuitem" onClick={handleLogout} disabled={logout.isPending}>
                {logout.isPending ? 'Выхожу…' : 'Выйти'}
              </button>
            </div>
          )}
        </div>
      </nav>
      <ExportAnswersDialog open={exportOpen} onOpenChange={setExportOpen} />
    </header>
  );
}

function HamburgerIcon() {
  return (
    <span className="hamburger-icon" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Hamburger menu used on the public diagnostic form page, matching the reference's HeaderMenu. */
export function HeaderMenu({ onNewDiagnostic }: { onNewDiagnostic: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside);
    };
  }, [open]);

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.setQueryData(getGetCurrentUserQueryKey(), null);
        setLocation('/login');
      },
    });
  };

  return (
    <div className="header-menu" ref={menuRef}>
      <button
        type="button"
        className="header-menu-trigger"
        aria-label="Открыть меню"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <HamburgerIcon />
      </button>
      {open && (
        <div className="header-menu-popover" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onNewDiagnostic(); }}>
            Новый разбор
          </button>
          <Link role="menuitem" href="/diagnostics">Мои разборы</Link>
          <button className="danger" type="button" role="menuitem" onClick={handleLogout} disabled={logout.isPending}>
            {logout.isPending ? 'Выхожу…' : 'Выйти'}
          </button>
        </div>
      )}
    </div>
  );
}

export function CabinetTitleRow({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
}) {
  return (
    <section className="admin-title-row">
      <div>
        <span className="admin-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </section>
  );
}
