import React from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ProfileEditModal({
    open,
    onOpenChange,
    title,
    subtitle,
    submitting = false,
    onSubmit,
    children,
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[90vh] overflow-y-auto bg-white p-4 sm:p-6">
                <DialogHeader>
                    <DialogTitle className="text-xl font-heading font-black">{title}</DialogTitle>
                    {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
                </DialogHeader>

                <form
                    className="space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSubmit?.();
                    }}
                >
                    {children}

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" className="border-black/20" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={submitting}>
                            {submitting ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
