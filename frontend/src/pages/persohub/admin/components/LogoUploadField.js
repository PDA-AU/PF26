import React, { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function LogoUploadField({
    id,
    label,
    value,
    onChange,
    onUploadFile,
    parseApiError,
}) {
    const inputRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    const handlePick = () => {
        if (inputRef.current) inputRef.current.click();
    };

    const handleFileSelected = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!String(file.type || '').startsWith('image/')) {
            toast.error('Only image files are allowed');
            event.target.value = '';
            return;
        }
        setUploading(true);
        try {
            const uploadedUrl = await onUploadFile(file);
            onChange(uploadedUrl);
            toast.success('Image uploaded');
        } catch (error) {
            const message = parseApiError
                ? parseApiError(error, 'Image upload failed')
                : 'Image upload failed';
            toast.error(message);
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                    id={id}
                    value={value || ''}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder="https://..."
                />
                <Button
                    type="button"
                    variant="outline"
                    className="border-black/20"
                    onClick={handlePick}
                    disabled={uploading}
                >
                    {uploading ? 'Uploading...' : 'Upload'}
                </Button>
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelected}
            />
            {value ? (
                <div className="overflow-hidden rounded-xl border border-black/10 bg-slate-50 p-2">
                    <img
                        src={value}
                        alt="Logo preview"
                        className="h-24 w-24 rounded-lg border border-black/10 object-cover"
                    />
                </div>
            ) : null}
        </div>
    );
}
