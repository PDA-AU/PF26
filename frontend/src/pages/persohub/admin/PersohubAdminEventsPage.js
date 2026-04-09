import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import ParsedDescription from '@/components/common/ParsedDescription';
import LoadingState from '@/components/common/LoadingState';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import { persohubAdminApi } from '@/pages/persohub/admin/api';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';
import { compressImageToWebp } from '@/utils/imageCompression';
import {
    parsePosterAssets,
    pickPosterAssetByRatio,
    POSTER_ASPECT_RATIOS,
    POSTER_ASPECT_RATIO_LABELS,
    resolvePosterUrl,
    serializePosterAssets,
} from '@/utils/posterAssets';

const initialForm = {
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    event_time: '',
    poster_url: '',
    whatsapp_url: '',
    external_url_name: 'Click To Register',
    event_type: 'Technical',
    format: 'Offline',
    template_option: 'attendance_scoring',
    participant_mode: 'individual',
    open_for: 'MIT',
    round_mode: 'single',
    round_count: 1,
    team_min_size: '',
    team_max_size: '',
    show_register_now_button: true,
    registration_fee_enabled: false,
    registration_fee_mit: '0',
    registration_fee_other: '0',
    seat_availability_enabled: false,
    seat_capacity: '100',
    sympo_id: 'none',
};

const makePosterAssetId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const toPosterAssetRows = (rawPosterUrl) => parsePosterAssets(rawPosterUrl).map((asset) => ({
    id: makePosterAssetId(),
    aspect_ratio: asset.aspect_ratio || '4:5',
    url: asset.url,
    file: null,
    preview_url: '',
}));

const releasePosterPreviewUrls = (rows) => {
    (rows || []).forEach((row) => {
        if (row?.preview_url) {
            URL.revokeObjectURL(row.preview_url);
        }
    });
};

const toDateInputValue = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    return raw.slice(0, 10);
};

const toTimeInputValue = (value) => {
    if (!value) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    return raw.slice(0, 5);
};

const parseSeatCapacity = (value) => {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 100;
    return parsed;
};

const normalizeEventDateValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const asIso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (asIso) {
        const year = Number(asIso[1]);
        const month = Number(asIso[2]);
        const day = Number(asIso[3]);
        const candidate = new Date(Date.UTC(year, month - 1, day));
        if (
            candidate.getUTCFullYear() === year
            && candidate.getUTCMonth() + 1 === month
            && candidate.getUTCDate() === day
        ) {
            return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        return raw;
    }

    const asSlash = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (!asSlash) return raw;

    const first = Number(asSlash[1]);
    const second = Number(asSlash[2]);
    const year = Number(asSlash[3]);
    const candidates = [];

    // Prefer MM/DD/YYYY (Safari / US input fallback), then DD/MM/YYYY if needed.
    candidates.push({ month: first, day: second });
    candidates.push({ month: second, day: first });

    for (const item of candidates) {
        const { month, day } = item;
        const candidate = new Date(Date.UTC(year, month - 1, day));
        if (
            candidate.getUTCFullYear() === year
            && candidate.getUTCMonth() + 1 === month
            && candidate.getUTCDate() === day
        ) {
            return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    return raw;
};

const normalizeEventTimeValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const amPmMatch = raw.match(/^(\d{1,2}):(\d{1,2})\s*([AaPp][Mm])$/);
    if (amPmMatch) {
        let hours = Number(amPmMatch[1]);
        const minutes = Number(amPmMatch[2]);
        const meridiem = String(amPmMatch[3] || '').toUpperCase();
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
            return raw;
        }
        if (meridiem === 'AM') {
            if (hours === 12) hours = 0;
        } else if (hours < 12) {
            hours += 12;
        }
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    const match = raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!match) return raw;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return raw;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const parseDateParts = (value) => {
    const normalized = normalizeEventDateValue(value);
    const match = String(normalized || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return { year: '', month: '', day: '' };
    return {
        year: match[1],
        month: match[2],
        day: match[3],
    };
};

const daysInMonth = (year, month) => {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 31;
    return new Date(y, m, 0).getDate();
};

const MONTH_OPTIONS = [
    { value: '01', label: 'Jan' },
    { value: '02', label: 'Feb' },
    { value: '03', label: 'Mar' },
    { value: '04', label: 'Apr' },
    { value: '05', label: 'May' },
    { value: '06', label: 'Jun' },
    { value: '07', label: 'Jul' },
    { value: '08', label: 'Aug' },
    { value: '09', label: 'Sep' },
    { value: '10', label: 'Oct' },
    { value: '11', label: 'Nov' },
    { value: '12', label: 'Dec' },
];

const YEAR_OPTIONS = (() => {
    const base = new Date().getFullYear();
    return Array.from({ length: 16 }, (_, idx) => String(base - 4 + idx));
})();

const parseTimeParts = (value) => {
    const normalized = normalizeEventTimeValue(value);
    const match = String(normalized || '').match(/^(\d{2}):(\d{2})$/);
    if (!match) return { hour12: '', minute: '', meridiem: '' };
    const hour24 = Number(match[1]);
    const minute = match[2];
    const meridiem = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    return { hour12: String(hour12).padStart(2, '0'), minute, meridiem };
};

function CustomDatePicker({ value, onChange }) {
    const initial = parseDateParts(value);
    const [year, setYear] = useState(initial.year);
    const [month, setMonth] = useState(initial.month);
    const [day, setDay] = useState(initial.day);

    useEffect(() => {
        const parsed = parseDateParts(value);
        setYear(parsed.year);
        setMonth(parsed.month);
        setDay(parsed.day);
    }, [value]);

    useEffect(() => {
        if (!year || !month) return;
        const maxDay = daysInMonth(year, month);
        if (day && Number(day) > maxDay) {
            setDay(String(maxDay).padStart(2, '0'));
        }
    }, [year, month, day]);

    const maxDay = daysInMonth(year || YEAR_OPTIONS[0], month || '01');
    const dayOptions = Array.from({ length: maxDay }, (_, idx) => String(idx + 1).padStart(2, '0'));

    const pushValue = (nextYear, nextMonth, nextDay) => {
        if (nextYear && nextMonth && nextDay) {
            onChange(`${nextYear}-${nextMonth}-${nextDay}`);
            return;
        }
        onChange('');
    };

    return (
        <div className="grid grid-cols-3 gap-2">
            <select
                value={year}
                onChange={(e) => {
                    const next = e.target.value;
                    setYear(next);
                    pushValue(next, month, day);
                }}
                className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
            >
                <option value="">Year</option>
                {YEAR_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
            <select
                value={month}
                onChange={(e) => {
                    const next = e.target.value;
                    setMonth(next);
                    pushValue(year, next, day);
                }}
                className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
            >
                <option value="">Month</option>
                {MONTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
            <select
                value={day}
                onChange={(e) => {
                    const next = e.target.value;
                    setDay(next);
                    pushValue(year, month, next);
                }}
                className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
            >
                <option value="">Day</option>
                {dayOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </div>
    );
}

function CustomTimePicker({ value, onChange }) {
    const initial = parseTimeParts(value);
    const [hour12, setHour12] = useState(initial.hour12);
    const [minute, setMinute] = useState(initial.minute);
    const [meridiem, setMeridiem] = useState(initial.meridiem);

    useEffect(() => {
        const parsed = parseTimeParts(value);
        setHour12(parsed.hour12);
        setMinute(parsed.minute);
        setMeridiem(parsed.meridiem);
    }, [value]);

    const pushValue = (nextHour12, nextMinute, nextMeridiem) => {
        if (!nextHour12 || !nextMinute || !nextMeridiem) {
            onChange('');
            return;
        }
        const hour = Number(nextHour12);
        const min = Number(nextMinute);
        if (!Number.isFinite(hour) || !Number.isFinite(min)) {
            onChange('');
            return;
        }
        let hour24 = hour % 12;
        if (String(nextMeridiem).toUpperCase() === 'PM') hour24 += 12;
        onChange(`${String(hour24).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    };

    const hourOptions = Array.from({ length: 12 }, (_, idx) => String(idx + 1).padStart(2, '0'));
    const minuteOptions = Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0'));

    return (
        <div className="grid grid-cols-3 gap-2">
            <select
                value={hour12}
                onChange={(e) => {
                    const next = e.target.value;
                    setHour12(next);
                    pushValue(next, minute, meridiem);
                }}
                className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
            >
                <option value="">Hour</option>
                {hourOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
            <select
                value={minute}
                onChange={(e) => {
                    const next = e.target.value;
                    setMinute(next);
                    pushValue(hour12, next, meridiem);
                }}
                className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
            >
                <option value="">Min</option>
                {minuteOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
            <select
                value={meridiem}
                onChange={(e) => {
                    const next = e.target.value;
                    setMeridiem(next);
                    pushValue(hour12, minute, next);
                }}
                className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
            >
                <option value="">AM/PM</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
            </select>
        </div>
    );
}

const toEventForm = (eventRow = {}) => ({
    title: eventRow.title || '',
    description: eventRow.description || '',
    start_date: toDateInputValue(eventRow.start_date),
    end_date: toDateInputValue(eventRow.end_date),
    event_time: toTimeInputValue(eventRow.event_time),
    poster_url: eventRow.poster_url || '',
    whatsapp_url: eventRow.whatsapp_url || '',
    external_url_name: eventRow.external_url_name || 'Click To Register',
    event_type: eventRow.event_type || 'Technical',
    format: eventRow.format || 'Offline',
    template_option: eventRow.template_option || 'attendance_scoring',
    participant_mode: eventRow.participant_mode || 'individual',
    open_for: eventRow.open_for || 'MIT',
    round_mode: eventRow.round_mode || 'single',
    round_count: Number(eventRow.round_count || 1),
    team_min_size: eventRow.team_min_size ?? '',
    team_max_size: eventRow.team_max_size ?? '',
    show_register_now_button: eventRow.show_register_now_button !== false,
    registration_fee_enabled: Boolean(eventRow.registration_fee?.enabled),
    registration_fee_mit: String(eventRow.registration_fee?.amounts?.MIT ?? 0),
    registration_fee_other: String(eventRow.registration_fee?.amounts?.Other ?? 0),
    seat_availability_enabled: Boolean(eventRow.seat_availability_enabled),
    seat_capacity: String(eventRow.seat_capacity ?? 100),
    sympo_id: eventRow.sympo_id ? String(eventRow.sympo_id) : 'none',
});

const formatDateLabel = (value) => {
    const dateValue = toDateInputValue(value);
    if (!dateValue) return 'TBD';
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTimeLabel = (value) => {
    const timeValue = toTimeInputValue(value);
    if (!timeValue) return 'TBD';
    return timeValue;
};

const buildEventPayload = (formState, posterUrl) => ({
    title: formState.title.trim(),
    description: formState.description?.trim() || '',
    start_date: normalizeEventDateValue(formState.start_date) || null,
    end_date: normalizeEventDateValue(formState.end_date) || null,
    event_time: normalizeEventTimeValue(formState.event_time) || null,
    poster_url: posterUrl,
    whatsapp_url: formState.whatsapp_url?.trim() || null,
    external_url_name: formState.external_url_name?.trim() || 'Click To Register',
    event_type: formState.event_type,
    format: formState.format,
    template_option: formState.template_option,
    participant_mode: formState.participant_mode,
    open_for: formState.open_for || 'MIT',
    round_mode: formState.round_mode,
    round_count: Number(formState.round_count || 1),
    team_min_size: formState.participant_mode === 'team' ? Number(formState.team_min_size || 1) : null,
    team_max_size: formState.participant_mode === 'team' ? Number(formState.team_max_size || 1) : null,
    show_register_now_button: Boolean(formState.show_register_now_button),
    registration_fee: formState.registration_fee_enabled ? {
        enabled: true,
        currency: 'INR',
        amounts: {
            MIT: Math.max(0, Number(formState.registration_fee_mit || 0)),
            Other: Math.max(0, Number(formState.registration_fee_other || 0)),
        },
    } : null,
    seat_availability_enabled: Boolean(formState.seat_availability_enabled),
    seat_capacity: Boolean(formState.seat_availability_enabled)
        ? parseSeatCapacity(formState.seat_capacity)
        : (Number.isFinite(Number(formState.seat_capacity)) && Number(formState.seat_capacity) > 0
            ? Number(formState.seat_capacity)
            : null),
});

const getCardPosterSrc = (rawPosterUrl) => {
    const assets = parsePosterAssets(rawPosterUrl);
    const preferred = pickPosterAssetByRatio(assets, ['A4-portrait', 'A4-landscape', '4:5', '5:4', '1:1', '2:1']);
    return resolvePosterUrl(preferred?.url);
};

function EventFormFields({
    form,
    setForm,
    posterInputId,
    posterAssets,
    setPosterAssets,
    posterUploadRatio,
    setPosterUploadRatio,
    sympoOptions,
    lockParticipantMode = false,
}) {
    return (
        <>
            <div className="md:col-span-2">
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
            </div>
            <div className="md:col-span-2">
                <Label>Description</Label>
                <Textarea
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    rows={8}
                    className="min-h-[180px]"
                />
                <div className="mt-2 rounded-lg border border-black/10 bg-slate-50 p-3 text-xs text-slate-600">
                    <p className="font-semibold uppercase tracking-[0.08em] text-slate-700">Parsing Hints</p>
                    <p className="mt-1">Use plain text with these formats:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                        <li><code>*bold text*</code> or <code>**bold text**</code> for bold emphasis.</li>
                        <li><code>@profile_name</code> for mentions (example: <code>@pdawebteam</code>).</li>
                        <li><code>#tag</code> for hashtags (example: <code>#hackathon</code>).</li>
                        <li><code>https://example.com/register</code> for clickable links.</li>
                        <li>Use a new line to continue content on the next line.</li>
                        <li>Use an empty line to start a new paragraph block.</li>
                        <li>Typed <code>\\n</code> is also treated as a new line.</li>
                        <li><code>- point one</code>, <code>- point two</code> for bullet lists.</li>
                        <li><code>1. step one</code>, <code>2. step two</code> for numbered lines.</li>
                    </ul>
                </div>
            </div>
            <div>
                <Label>Start Date</Label>
                <div className="mt-1 flex items-center gap-2">
                    <CustomDatePicker
                        value={form.start_date}
                        onChange={(value) => setForm((prev) => ({ ...prev, start_date: normalizeEventDateValue(value) }))}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="border-black/20"
                        onClick={() => setForm((prev) => ({ ...prev, start_date: '' }))}
                        disabled={!form.start_date}
                    >
                        Clear
                    </Button>
                </div>
            </div>
            <div>
                <Label>End Date</Label>
                <div className="mt-1 flex items-center gap-2">
                    <CustomDatePicker
                        value={form.end_date}
                        onChange={(value) => setForm((prev) => ({ ...prev, end_date: normalizeEventDateValue(value) }))}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="border-black/20"
                        onClick={() => setForm((prev) => ({ ...prev, end_date: '' }))}
                        disabled={!form.end_date}
                    >
                        Clear
                    </Button>
                </div>
            </div>
            <div>
                <Label>Time</Label>
                <div className="mt-1 flex items-center gap-2">
                    <CustomTimePicker
                        value={form.event_time}
                        onChange={(value) => setForm((prev) => ({ ...prev, event_time: normalizeEventTimeValue(value) }))}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="border-black/20"
                        onClick={() => setForm((prev) => ({ ...prev, event_time: '' }))}
                        disabled={!form.event_time}
                    >
                        Clear
                    </Button>
                </div>
            </div>
            <div>
                <Label>Sympo</Label>
                <Select value={form.sympo_id} onValueChange={(value) => setForm((prev) => ({ ...prev, sympo_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="No sympo" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">No sympo</SelectItem>
                        {sympoOptions.map((sympo) => (
                            <SelectItem key={sympo.id} value={String(sympo.id)}>{sympo.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="md:col-span-2">
                <Label htmlFor={posterInputId}>Poster Uploads (Multiple Ratios)</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-[160px_1fr]">
                    <select
                        value={posterUploadRatio}
                        onChange={(e) => setPosterUploadRatio(e.target.value)}
                        className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm"
                    >
                        {POSTER_ASPECT_RATIOS.map((ratio) => (
                            <option key={ratio} value={ratio}>
                                {POSTER_ASPECT_RATIO_LABELS[ratio] || ratio}
                            </option>
                        ))}
                    </select>
                    <Input
                        id={posterInputId}
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (!files.length) return;
                            setPosterAssets((prev) => ([
                                ...prev,
                                ...files.map((file) => ({
                                    id: makePosterAssetId(),
                                    aspect_ratio: posterUploadRatio,
                                    url: '',
                                    file,
                                    preview_url: URL.createObjectURL(file),
                                })),
                            ]));
                            e.target.value = '';
                        }}
                    />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    Select an aspect ratio, then upload one or more images for that ratio.
                </p>
                {posterAssets.length ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {posterAssets.map((asset) => (
                            <div key={asset.id} className="rounded-xl border border-black/10 bg-[#fffdf7] p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]">
                                        {POSTER_ASPECT_RATIO_LABELS[asset.aspect_ratio] || asset.aspect_ratio}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-7 border-black/10 px-2 text-xs"
                                        onClick={() => {
                                            if (asset.preview_url) URL.revokeObjectURL(asset.preview_url);
                                            setPosterAssets((prev) => prev.filter((row) => row.id !== asset.id));
                                        }}
                                    >
                                        Remove
                                    </Button>
                                </div>
                                <img
                                    src={asset.preview_url || asset.url}
                                    alt="Poster preview"
                                    className="max-h-44 w-full rounded-lg border border-black/10 object-contain bg-white"
                                />
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="md:col-span-2">
                <Label>External Registration / Wp Link</Label>
                <Input
                    type="url"
                    value={form.whatsapp_url}
                    onChange={(e) => setForm((prev) => ({ ...prev, whatsapp_url: e.target.value }))}
                    placeholder="https://chat.whatsapp.com/..."
                />
            </div>
            <div className="md:col-span-2">
                <Label>External Link Button Name</Label>
                <Input
                    value={form.external_url_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, external_url_name: e.target.value }))}
                    placeholder="Click To Register"
                />
            </div>
            <div>
                <Label>Type</Label>
                <Select value={form.event_type} onValueChange={(value) => setForm((prev) => ({ ...prev, event_type: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Technical">Technical</SelectItem>
                        <SelectItem value="FunTechinical">FunTechinical</SelectItem>
                        <SelectItem value="Hackathon">Hackathon</SelectItem>
                        <SelectItem value="Signature">Signature</SelectItem>
                        <SelectItem value="NonTechinical">NonTechinical</SelectItem>
                        <SelectItem value="Session">Session</SelectItem>
                        <SelectItem value="Workshop">Workshop</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Format</Label>
                <Select value={form.format} onValueChange={(value) => setForm((prev) => ({ ...prev, format: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Online">Online</SelectItem>
                        <SelectItem value="Offline">Offline</SelectItem>
                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Template</Label>
                <Select value={form.template_option} onValueChange={(value) => setForm((prev) => ({ ...prev, template_option: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="attendance_only">Only Attendance</SelectItem>
                        <SelectItem value="attendance_scoring">Attendance + Scoring</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Participant Mode</Label>
                <Select value={form.participant_mode} onValueChange={(value) => setForm((prev) => ({ ...prev, participant_mode: value }))} disabled={lockParticipantMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                    </SelectContent>
                </Select>
                {lockParticipantMode ? (
                    <p className="mt-1 text-[11px] text-slate-500">Participant mode is locked after event creation.</p>
                ) : null}
            </div>
            <div>
                <Label>Open For</Label>
                <Select value={form.open_for || 'MIT'} onValueChange={(value) => setForm((prev) => ({ ...prev, open_for: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="MIT">MIT Students</SelectItem>
                        <SelectItem value="ALL">All Colleges</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Round Mode</Label>
                <Select value={form.round_mode} onValueChange={(value) => setForm((prev) => ({ ...prev, round_mode: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="single">Single Round</SelectItem>
                        <SelectItem value="multi">Multi Round</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Round Count</Label>
                <Input
                    type="number"
                    min={1}
                    max={20}
                    value={form.round_count}
                    disabled={form.round_mode === 'single'}
                    onChange={(e) => setForm((prev) => ({ ...prev, round_count: e.target.value }))}
                />
            </div>
            {form.participant_mode === 'team' ? (
                <>
                    <div>
                        <Label>Team Min Size</Label>
                        <Input type="number" min={1} value={form.team_min_size} onChange={(e) => setForm((prev) => ({ ...prev, team_min_size: e.target.value }))} required />
                    </div>
                    <div>
                        <Label>Team Max Size</Label>
                        <Input type="number" min={1} value={form.team_max_size} onChange={(e) => setForm((prev) => ({ ...prev, team_max_size: e.target.value }))} required />
                    </div>
                </>
            ) : null}
            <div className="md:col-span-2 rounded-xl border border-black/10 bg-[#fffdf7] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <Label className="text-sm font-semibold">Register Now Button</Label>
                        <p className="mt-1 text-xs text-slate-600">Show or hide the Register Now button on the event dashboard.</p>
                    </div>
                    <Switch
                        checked={Boolean(form.show_register_now_button)}
                        onCheckedChange={(checked) => setForm((prev) => ({ ...prev, show_register_now_button: Boolean(checked) }))}
                    />
                </div>
            </div>
            <div className="md:col-span-2 rounded-xl border border-black/10 bg-[#fffdf7] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <Label className="text-sm font-semibold">Registration Fee</Label>
                        <p className="mt-1 text-xs text-slate-600">Enable paid registration with fixed slabs for MIT and Other.</p>
                    </div>
                    <Switch
                        checked={Boolean(form.registration_fee_enabled)}
                        onCheckedChange={(checked) => setForm((prev) => ({ ...prev, registration_fee_enabled: Boolean(checked) }))}
                    />
                </div>
                {form.registration_fee_enabled ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label>MIT Amount (INR)</Label>
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={form.registration_fee_mit}
                                onChange={(e) => setForm((prev) => ({ ...prev, registration_fee_mit: e.target.value }))}
                            />
                        </div>
                        <div>
                            <Label>Other Amount (INR)</Label>
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={form.registration_fee_other}
                                onChange={(e) => setForm((prev) => ({ ...prev, registration_fee_other: e.target.value }))}
                            />
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="md:col-span-2 rounded-xl border border-black/10 bg-[#fffdf7] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <Label className="text-sm font-semibold">Seats Availability</Label>
                        <p className="mt-1 text-xs text-slate-600">Enable seat tracking for this event.</p>
                    </div>
                    <Switch
                        checked={Boolean(form.seat_availability_enabled)}
                        onCheckedChange={(checked) => setForm((prev) => ({
                            ...prev,
                            seat_availability_enabled: Boolean(checked),
                            seat_capacity: Boolean(checked)
                                ? (String(prev.seat_capacity || '').trim() || '100')
                                : prev.seat_capacity,
                        }))}
                    />
                </div>
                {form.seat_availability_enabled ? (
                    <div className="mt-4">
                        <Label>No. of Seats</Label>
                        <Input
                            type="number"
                            min={1}
                            value={form.seat_capacity}
                            onChange={(e) => setForm((prev) => ({ ...prev, seat_capacity: e.target.value }))}
                            placeholder="100"
                        />
                    </div>
                ) : null}
            </div>
        </>
    );
}

export default function PersohubAdminEventsPage() {
    const { community } = usePersohubAdminAuth();
    const canMutate = Boolean(community?.is_club_owner || community?.is_club_superadmin);
    const canAccessEvents = Boolean(community?.can_access_events);

    const [events, setEvents] = useState([]);
    const [sympoOptions, setSympoOptions] = useState([]);
    const [eventSympoDrafts, setEventSympoDrafts] = useState({});
    const [assigningSympoSlug, setAssigningSympoSlug] = useState('');
    const [requestingAccessSlug, setRequestingAccessSlug] = useState('');
    const [query, setQuery] = useState('');
    const [queryDebounced, setQueryDebounced] = useState('');
    const [openForFilter, setOpenForFilter] = useState('ALL');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [posterAssets, setPosterAssets] = useState([]);
    const [editPosterAssets, setEditPosterAssets] = useState([]);
    const [posterUploadRatio, setPosterUploadRatio] = useState('4:5');
    const [editPosterUploadRatio, setEditPosterUploadRatio] = useState('4:5');
    const [uploadingPoster, setUploadingPoster] = useState(false);
    const [uploadingEditPoster, setUploadingEditPoster] = useState(false);
    const [form, setForm] = useState(initialForm);
    const [editForm, setEditForm] = useState(initialForm);
    const [expandedDescriptions, setExpandedDescriptions] = useState({});

    useEffect(() => {
        const timer = setTimeout(() => setQueryDebounced(query.trim()), 250);
        return () => clearTimeout(timer);
    }, [query]);

    const fetchEvents = useCallback(async () => {
        if (!community || !canAccessEvents) {
            setEvents([]);
            setTotalCount(0);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const response = await persohubAdminApi.listPersohubEvents({
                page,
                page_size: pageSize,
                q: queryDebounced || undefined,
                open_for: openForFilter === 'ALL' ? undefined : openForFilter,
            });
            const rows = response?.items || [];
            setEvents(rows);
            setTotalCount(Number(response?.totalCount || 0));
            setEventSympoDrafts(
                rows.reduce((acc, eventRow) => {
                    acc[eventRow.slug] = eventRow.sympo_id ? String(eventRow.sympo_id) : 'none';
                    return acc;
                }, {})
            );
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load events'));
        } finally {
            setLoading(false);
        }
    }, [canAccessEvents, community, openForFilter, page, pageSize, queryDebounced]);

    const fetchSympoOptions = useCallback(async () => {
        if (!community || !canMutate) {
            setSympoOptions([]);
            return;
        }
        try {
            const rows = await persohubAdminApi.listPersohubSympoOptions();
            setSympoOptions(rows || []);
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load sympos'));
        }
    }, [canMutate, community]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useEffect(() => {
        fetchSympoOptions();
    }, [fetchSympoOptions]);

    const validateDateRange = (formState) => {
        const normalizedStart = normalizeEventDateValue(formState.start_date);
        const normalizedEnd = normalizeEventDateValue(formState.end_date);
        if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
            toast.error('Start date cannot be after end date');
            return false;
        }
        return true;
    };

    const validateRegistrationFee = (formState) => {
        if (!formState.registration_fee_enabled) return true;
        const mit = Number(formState.registration_fee_mit);
        const other = Number(formState.registration_fee_other);
        if (!Number.isFinite(mit) || mit < 0 || !Number.isFinite(other) || other < 0) {
            toast.error('Registration fee amounts must be valid non-negative numbers');
            return false;
        }
        return true;
    };

    const validateSeatAvailability = (formState) => {
        if (!formState.seat_availability_enabled) return true;
        const seatCapacity = Number.parseInt(String(formState.seat_capacity || '').trim(), 10);
        if (!Number.isFinite(seatCapacity) || seatCapacity < 1) {
            toast.error('No. of Seats must be a valid number greater than 0');
            return false;
        }
        return true;
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        if (!canMutate) return;
        if (!validateDateRange(form)) return;
        if (!validateRegistrationFee(form)) return;
        if (!validateSeatAvailability(form)) return;
        setSaving(true);
        try {
            let nextAssets = posterAssets.filter((asset) => asset.url && !asset.file).map((asset) => ({
                url: asset.url,
                aspect_ratio: asset.aspect_ratio,
            }));
            const pendingAssets = posterAssets.filter((asset) => asset.file);
            if (pendingAssets.length) {
                setUploadingPoster(true);
                for (const asset of pendingAssets) {
                    const processedPoster = await compressImageToWebp(asset.file);
                    const uploadedUrl = await persohubAdminApi.uploadEventPoster(processedPoster);
                    nextAssets.push({
                        url: uploadedUrl,
                        aspect_ratio: asset.aspect_ratio,
                    });
                }
                setUploadingPoster(false);
            }
            const posterUrl = serializePosterAssets(nextAssets);
            const payload = buildEventPayload(form, posterUrl);
            const createdEvent = await persohubAdminApi.createPersohubEvent(payload);
            if (form.sympo_id && form.sympo_id !== 'none') {
                await persohubAdminApi.assignPersohubEventSympo(createdEvent.slug, { sympo_id: Number(form.sympo_id) });
            }
            toast.success('Event created');
            setForm(initialForm);
            releasePosterPreviewUrls(posterAssets);
            setPosterAssets([]);
            setPosterUploadRatio('4:5');
            fetchEvents();
        } catch (error) {
            setUploadingPoster(false);
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to create event'));
        } finally {
            setSaving(false);
            setUploadingPoster(false);
        }
    };

    const openEditDialog = (eventRow) => {
        if (!canMutate) return;
        setEditTarget(eventRow);
        setEditForm(toEventForm(eventRow));
        releasePosterPreviewUrls(editPosterAssets);
        setEditPosterAssets(toPosterAssetRows(eventRow.poster_url));
        setEditPosterUploadRatio('4:5');
        setEditDialogOpen(true);
    };

    const closeEditDialog = (force = false) => {
        if (!force && (savingEdit || uploadingEditPoster)) return;
        setEditDialogOpen(false);
        setEditTarget(null);
        setEditForm(initialForm);
        releasePosterPreviewUrls(editPosterAssets);
        setEditPosterAssets([]);
        setEditPosterUploadRatio('4:5');
    };

    const updateEvent = async (e) => {
        e.preventDefault();
        if (!canMutate || !editTarget) return;
        if (!validateDateRange(editForm)) return;
        if (!validateRegistrationFee(editForm)) return;
        if (!validateSeatAvailability(editForm)) return;
        setSavingEdit(true);
        try {
            let nextAssets = editPosterAssets.filter((asset) => asset.url && !asset.file).map((asset) => ({
                url: asset.url,
                aspect_ratio: asset.aspect_ratio,
            }));
            const pendingAssets = editPosterAssets.filter((asset) => asset.file);
            if (pendingAssets.length) {
                setUploadingEditPoster(true);
                for (const asset of pendingAssets) {
                    const processedPoster = await compressImageToWebp(asset.file);
                    const uploadedUrl = await persohubAdminApi.uploadEventPoster(processedPoster);
                    nextAssets.push({
                        url: uploadedUrl,
                        aspect_ratio: asset.aspect_ratio,
                    });
                }
                setUploadingEditPoster(false);
            }
            const posterUrl = serializePosterAssets(nextAssets);
            const payload = buildEventPayload(editForm, posterUrl);
            await persohubAdminApi.updatePersohubEvent(editTarget.slug, payload);
            await persohubAdminApi.assignPersohubEventSympo(editTarget.slug, {
                sympo_id: editForm.sympo_id === 'none' ? null : Number(editForm.sympo_id),
            });
            toast.success('Event updated');
            closeEditDialog(true);
            setEditPosterUploadRatio('4:5');
            fetchEvents();
        } catch (error) {
            setUploadingEditPoster(false);
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update event'));
        } finally {
            setSavingEdit(false);
            setUploadingEditPoster(false);
        }
    };

    const toggleStatus = async (eventRow) => {
        if (!canMutate) return;
        const nextStatus = eventRow.status === 'open' ? 'closed' : 'open';
        try {
            await persohubAdminApi.updatePersohubEvent(eventRow.slug, { status: nextStatus });
            toast.success(`Event ${nextStatus}`);
            fetchEvents();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update status'));
        }
    };

    const openDeleteDialog = (eventRow) => {
        if (!canMutate) return;
        setDeleteTarget(eventRow);
        setDeleteConfirmText('');
        setDeleteDialogOpen(true);
    };

    const closeDeleteDialog = () => {
        if (deleting) return;
        setDeleteDialogOpen(false);
        setDeleteTarget(null);
        setDeleteConfirmText('');
    };

    const deleteEvent = async () => {
        if (!deleteTarget || deleteConfirmText !== 'DELETE' || !canMutate) return;
        setDeleting(true);
        try {
            await persohubAdminApi.deletePersohubEvent(deleteTarget.slug);
            toast.success('Event deleted');
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
            setDeleteConfirmText('');
            fetchEvents();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to delete event'));
        } finally {
            setDeleting(false);
        }
    };

    const assignEventSympo = async (eventRow) => {
        if (!canMutate || assigningSympoSlug) return;
        const currentValue = eventRow.sympo_id ? String(eventRow.sympo_id) : 'none';
        const draftValue = eventSympoDrafts[eventRow.slug] || currentValue;
        if (currentValue === draftValue) return;
        setAssigningSympoSlug(eventRow.slug);
        try {
            const payload = { sympo_id: draftValue === 'none' ? null : Number(draftValue) };
            const response = await persohubAdminApi.assignPersohubEventSympo(eventRow.slug, payload);
            toast.success(response?.message || 'Event mapping updated');
            fetchEvents();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update event mapping'));
        } finally {
            setAssigningSympoSlug('');
        }
    };

    const requestEventAccess = async (eventRow) => {
        if (!canMutate || requestingAccessSlug) return;
        setRequestingAccessSlug(eventRow.slug);
        try {
            const response = await persohubAdminApi.requestPersohubEventAccess(eventRow.slug);
            toast.success(response?.message || 'Access request submitted');
            fetchEvents();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to submit access request'));
        } finally {
            setRequestingAccessSlug('');
        }
    };

    if (!canAccessEvents) {
        return (
            <PersohubAdminLayout
                title="Persohub Admin Events"
                subtitle="Manage events delegated for your club."
                activeTab="events"
            >
                <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Access denied. Your account does not have event access in this club.
                </section>
            </PersohubAdminLayout>
        );
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const startIndex = totalCount ? ((page - 1) * pageSize) + 1 : 0;
    const endIndex = totalCount ? Math.min(totalCount, page * pageSize) : 0;

    return (
        <PersohubAdminLayout
            title="Persohub Admin Events"
            subtitle={canMutate ? "Manage club-owned events for your club." : "Manage only the events assigned by policy."}
            activeTab="events"
        >
            {canMutate ? (
                <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <h2 className="text-2xl font-heading font-black">Create Event</h2>
                    <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
                        <EventFormFields
                            form={form}
                            setForm={setForm}
                            posterInputId="persohub-event-poster-upload"
                            posterAssets={posterAssets}
                            setPosterAssets={setPosterAssets}
                            posterUploadRatio={posterUploadRatio}
                            setPosterUploadRatio={setPosterUploadRatio}
                            sympoOptions={sympoOptions}
                            lockParticipantMode={false}
                        />
                        <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={saving || uploadingPoster}>
                                {uploadingPoster ? 'Uploading Poster...' : saving ? 'Creating...' : 'Create Event'}
                            </Button>
                        </div>
                    </form>
                </section>
            ) : null}

            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-2xl font-heading font-black">Club Events</h2>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Select
                            value={openForFilter}
                            onValueChange={(value) => {
                                setOpenForFilter(value);
                                setPage(1);
                            }}
                        >
                            <SelectTrigger className="sm:w-40">
                                <SelectValue placeholder="Open For" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">All</SelectItem>
                                <SelectItem value="MIT">MIT</SelectItem>
                                <SelectItem value="NON_MIT">NON MIT</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setPage(1);
                            }}
                            placeholder="Search events"
                            className="sm:max-w-sm"
                        />
                    </div>
                </div>
                {loading ? (
                    <LoadingState variant="inline" containerClassName="mt-4" />
                ) : events.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No events available yet.</p>
                ) : (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                        {events.map((eventRow) => {
                            const description = String(eventRow.description || '').trim();
                            const isExpanded = Boolean(expandedDescriptions[eventRow.id]);
                            const canToggle = description.length > 160;
                            const shouldClamp = canToggle && !isExpanded;
                            const canManageEvent = Boolean(
                                canAccessEvents
                                && eventRow.persohub_access_approved
                            );

                            return (
                                <div key={eventRow.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                    {getCardPosterSrc(eventRow.poster_url) ? (
                                        <img
                                            src={getCardPosterSrc(eventRow.poster_url)}
                                            alt={`${eventRow.title} poster`}
                                            className="mb-3 aspect-[4/5] w-full rounded-xl border border-black/10 object-cover bg-white"
                                        />
                                    ) : null}
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{eventRow.event_code}</p>
                                            <h3 className="font-heading text-xl font-black">{eventRow.title}</h3>
                                            <p className="text-xs text-slate-500">{eventRow.slug}</p>
                                        </div>
                                        <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${eventRow.status === 'open' ? 'border-[#c99612] bg-[#fff3c4] text-[#7a5a00]' : 'border-black/10 bg-[#11131a] text-[#f6c347]'}`}>
                                            {eventRow.status}
                                        </span>
                                    </div>
                                    <div className="mt-2">
                                        <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${
                                            eventRow.persohub_access_approved
                                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                                : (eventRow.persohub_access_status === 'pending'
                                                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                                                    : 'border-red-300 bg-red-50 text-red-700')
                                        }`}>
                                            Access {eventRow.persohub_access_status || 'rejected'}
                                        </span>
                                    </div>
                                    <div className={`relative mt-3 space-y-2 text-sm text-slate-600 ${shouldClamp ? 'max-h-24 overflow-hidden' : ''}`}>
                                        <ParsedDescription
                                            description={eventRow.description}
                                            emptyText="No description provided."
                                            listClassName="list-disc space-y-1 pl-5"
                                        />
                                        {shouldClamp ? (
                                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#fffdf7] to-transparent" />
                                        ) : null}
                                    </div>
                                    {canToggle ? (
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            className="mt-2 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 underline underline-offset-2 hover:text-slate-800"
                                            onClick={() => setExpandedDescriptions((prev) => ({ ...prev, [eventRow.id]: !isExpanded }))}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    setExpandedDescriptions((prev) => ({ ...prev, [eventRow.id]: !isExpanded }));
                                                }
                                            }}
                                        >
                                            {isExpanded ? 'Read less' : 'Read more'}
                                        </span>
                                    ) : null}
                                    <p className="mt-2 text-xs font-medium text-slate-500">
                                        Start: {formatDateLabel(eventRow.start_date)} · End: {formatDateLabel(eventRow.end_date)} · Time: {formatTimeLabel(eventRow.event_time)}
                                    </p>
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.event_type}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.format}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.participant_mode}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.open_for || 'MIT'}</span>
                                        <span className="rounded-md border border-black/10 bg-white px-2 py-1">{eventRow.template_option}</span>
                                        {eventRow.registration_fee?.enabled ? (
                                            <span className="rounded-md border border-black/10 bg-[#fff3c4] px-2 py-1">
                                                Fee: MIT {Number(eventRow.registration_fee?.amounts?.MIT || 0)} / Other {Number(eventRow.registration_fee?.amounts?.Other || 0)} INR
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="mt-4 rounded-xl border border-black/10 bg-white p-3">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Add to symp</p>
                                        <p className="mt-1 text-xs text-slate-500">Current: {eventRow.sympo_name || 'Standalone'}</p>
                                        {canMutate ? (
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <Select
                                                    value={eventSympoDrafts[eventRow.slug] || (eventRow.sympo_id ? String(eventRow.sympo_id) : 'none')}
                                                    onValueChange={(value) => setEventSympoDrafts((prev) => ({ ...prev, [eventRow.slug]: value }))}
                                                >
                                                    <SelectTrigger className="w-full sm:w-[260px]">
                                                        <SelectValue placeholder="Select sympo" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">Standalone</SelectItem>
                                                        {sympoOptions.map((sympo) => (
                                                            <SelectItem key={sympo.id} value={String(sympo.id)}>{sympo.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    size="sm"
                                                    className="bg-[#11131a] text-white hover:bg-[#1f2330]"
                                                    disabled={
                                                        assigningSympoSlug === eventRow.slug
                                                        || (eventSympoDrafts[eventRow.slug] || (eventRow.sympo_id ? String(eventRow.sympo_id) : 'none'))
                                                            === (eventRow.sympo_id ? String(eventRow.sympo_id) : 'none')
                                                    }
                                                    onClick={() => assignEventSympo(eventRow)}
                                                >
                                                    {assigningSympoSlug === eventRow.slug ? 'Saving...' : 'Save Sympo'}
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>

                                    {canMutate || canManageEvent ? (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {canManageEvent ? (
                                                <Button asChild className="bg-[#11131a] text-white hover:bg-[#1f2330]">
                                                    <Link to={`/persohub/admin/events/${eventRow.slug}/dashboard`}>
                                                        Manage Event
                                                    </Link>
                                                </Button>
                                            ) : null}
                                            {canMutate && !Boolean(eventRow.persohub_access_approved) ? (
                                                <Button
                                                    variant="outline"
                                                    className="border-black/20"
                                                    onClick={() => requestEventAccess(eventRow)}
                                                    disabled={requestingAccessSlug === eventRow.slug || eventRow.persohub_access_status === 'pending'}
                                                >
                                                    {eventRow.persohub_access_status === 'pending'
                                                        ? 'Access Requested'
                                                        : (requestingAccessSlug === eventRow.slug ? 'Requesting...' : 'Request Persohub Access')}
                                                </Button>
                                            ) : null}
                                            {canMutate ? (
                                                <Button variant="outline" className="border-black/20" onClick={() => openEditDialog(eventRow)}>
                                                    Edit Event
                                                </Button>
                                            ) : null}
                                            {canMutate ? (
                                                <Button variant="outline" className="border-black/20" onClick={() => toggleStatus(eventRow)}>
                                                    {eventRow.status === 'open' ? 'Close Event' : 'Open Event'}
                                                </Button>
                                            ) : null}
                                            {canMutate ? (
                                                <Button
                                                    variant="outline"
                                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                                    onClick={() => openDeleteDialog(eventRow)}
                                                >
                                                    Delete Event
                                                </Button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <div className="mt-3">
                                        <Button asChild variant="outline" className="border-black/20">
                                            <Link to={`/persohub/events/${eventRow.slug}`}>
                                                Go to Persohub Feed
                                            </Link>
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="mt-5 flex items-center justify-between gap-2 text-sm">
                    <p className="text-slate-500">Showing {startIndex}-{endIndex} of {totalCount}</p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={loading || page <= 1}
                        >
                            Prev
                        </Button>
                        <span className="text-xs text-slate-600">Page {page} / {totalPages}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={loading || page >= totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </section>

            <Dialog open={editDialogOpen} onOpenChange={(open) => (open ? setEditDialogOpen(true) : closeEditDialog())}>
                <DialogContent className="max-h-[85vh] w-[92vw] max-w-[720px] overflow-y-auto border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-2xl font-black">Edit Event</DialogTitle>
                    </DialogHeader>
                    <form className="mt-2 grid gap-4 md:grid-cols-2" onSubmit={updateEvent}>
                        <EventFormFields
                            form={editForm}
                            setForm={setEditForm}
                            posterInputId="persohub-event-poster-upload-edit"
                            posterAssets={editPosterAssets}
                            setPosterAssets={setEditPosterAssets}
                            posterUploadRatio={editPosterUploadRatio}
                            setPosterUploadRatio={setEditPosterUploadRatio}
                            sympoOptions={sympoOptions}
                            lockParticipantMode
                        />
                        <div className="md:col-span-2 flex justify-end gap-2">
                            <Button type="button" variant="outline" className="border-black/20" onClick={() => closeEditDialog()} disabled={savingEdit || uploadingEditPoster}>
                                Cancel
                            </Button>
                            <Button type="submit" className="bg-[#11131a] text-white hover:bg-[#1f2330]" disabled={savingEdit || uploadingEditPoster}>
                                {uploadingEditPoster ? 'Uploading Poster...' : savingEdit ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={(open) => (open ? setDeleteDialogOpen(true) : closeDeleteDialog())}>
                <DialogContent className="w-[92vw] max-w-[520px] border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-bold text-2xl text-red-600">Delete Event</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">
                            This will permanently delete the event and cascade all related rounds, teams, registrations, attendance, scores, badges, invites, and logs.
                        </p>
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                            <p className="font-semibold">{deleteTarget?.title || '-'}</p>
                            <p className="text-slate-600">{deleteTarget?.slug || '-'}</p>
                        </div>
                        <div>
                            <Label>Type <span className="font-bold">DELETE</span> to confirm</Label>
                            <Input
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="DELETE"
                                className="mt-2"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" className="border-black/20" onClick={closeDeleteDialog} disabled={deleting}>
                                Cancel
                            </Button>
                            <Button
                                className="bg-red-600 text-white hover:bg-red-700"
                                onClick={deleteEvent}
                                disabled={deleting || deleteConfirmText !== 'DELETE'}
                            >
                                {deleting ? 'Deleting...' : 'Delete Event'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </PersohubAdminLayout>
    );
}
