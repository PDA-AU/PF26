import React from 'react';

import { Button } from '@/components/ui/button';

export default function ProfileSummaryCard({
    title,
    subtitle,
    fields,
    onEdit,
    editDisabled = false,
    disabledReason = '',
}) {
    return (
        <section className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-xl font-heading font-black">{title}</h2>
                    {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                </div>
                <Button
                    type="button"
                    variant="outline"
                    className="border-black/20"
                    onClick={onEdit}
                    disabled={editDisabled}
                >
                    Edit
                </Button>
            </div>

            {editDisabled && disabledReason ? (
                <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {disabledReason}
                </p>
            ) : null}

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                    <div key={field.label} className={field.fullWidth ? 'sm:col-span-2' : ''}>
                        <dt className="text-xs uppercase tracking-[0.12em] text-slate-500">{field.label}</dt>
                        <dd className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-black/5 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                            {field.value || '—'}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
