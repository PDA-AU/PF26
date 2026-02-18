import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/context/AuthContext';
import { ccAdminApi } from '@/pages/HomeAdmin/ccAdminApi';
import { uploadPoster } from '@/pages/HomeAdmin/adminApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { compressImageToWebp } from '@/utils/imageCompression';

const TARGET_SYMPO_NAME = 'chakravyuha-26';

const DEFAULT_CONTENT = {
    hero: {
        title: "CHAKRAVYUHA '26",
        subtitle: 'Where Strategy Meets Innovation',
        tagline: 'TUNE IN AND SIGN UP!',
        dates: '28-02-2026 - 01-03-2026',
        countdownDate: '2026-02-28T09:00:00',
        prizePool: '\u20b95,00,000+',
        internships: '50+',
        events: '100+',
        participants: '5000+',
        registerUrl: '#',
    },
    aboutChakravyuha: {
        title: 'ABOUT CHAKRAVYUHA',
        description: 'Chakravyuha symbolizes the fusion of intricate strategy, intelligence, and innovation-qualities that define both ancient warfare and modern technology. In the Mahabharata, only the most skilled and strategic minds could navigate this formation, and today\'s tech landscape is no different. To thrive, one must embrace adaptability, problem-solving, and futuristic thinking.',
        description2: 'Just like the interwoven layers of the Chakravyuha, today\'s world is built on the seamless integration of robotics, IoT, AI, software engineering, and entrepreneurship-each a vital component in shaping the next era of technological breakthroughs.',
        description3: "Chakravyuha'26 is a two-day fest where all technical clubs of MIT come together to host a dynamic lineup of events, workshops, and competitions-challenging minds, fostering collaboration, and pushing the boundaries of innovation.",
    },
    aboutMIT: {
        title: 'ABOUT MIT',
        description: 'Madras Institute of Technology (MIT), a constituent college of Anna University, is one of the premier technical institutions in India. Established in 1949, MIT has been a pioneer in engineering education with a rich legacy of producing industry leaders, entrepreneurs, and innovators.',
        description2: 'Located in Chromepet, Chennai, the campus spans over 640 acres and houses state-of-the-art laboratories, research centers, and innovation hubs. MIT offers undergraduate, postgraduate, and doctoral programs across various engineering disciplines.',
        highlights: [
            'Ranked among top engineering colleges in Tamil Nadu',
            'Home to 12+ technical clubs and student chapters',
            'Strong industry partnerships and placement record',
            'Active research in AI, Robotics, IoT, and emerging technologies',
        ],
    },
    eventPass: {
        title: 'EVENT PASS',
        subtitle: 'Choose your battle strategy',
        tiers: [],
    },
    services: {
        title: 'SERVICES & HOSPITALITY',
        subtitle: "We've got you covered",
        items: [],
    },
    gallery: {
        title: 'GALLERY',
        subtitle: 'Glimpses from past editions',
        images: [],
    },
    faq: {
        title: 'FREQUENTLY ASKED QUESTIONS',
        items: [],
    },
    reachUs: {
        title: 'REACH US',
        address: {
            line1: 'Madras Institute of Technology',
            line2: 'Anna University',
            line3: 'Chromepet, Chennai - 600044',
            line4: 'Tamil Nadu, India',
        },
        busInfo: {
            title: 'Bus Service',
            description: 'Free shuttle buses will operate from Tambaram Railway Station to MIT Campus throughout the fest days.',
            timings: '7:00 AM - 9:00 PM',
        },
        instructions: [],
        mapUrl: 'https://maps.google.com/?q=Madras+Institute+of+Technology+Chromepet',
    },
    contact: {
        title: 'CONTACT US',
        subtitle: 'Get in touch with us',
        email: 'chakravyuha26@mitindia.edu',
        phone: '+91 98765 43210',
        socials: {
            instagram: 'https://instagram.com/chakravyuha_mit',
            linkedin: 'https://linkedin.com/company/chakravyuha-mit',
            twitter: 'https://twitter.com/chakravyuha_mit',
            youtube: 'https://youtube.com/@chakravyuhamit',
        },
        coordinators: [],
    },
    footer: {
        copyright: '© 2026 Chakravyuha - MIT, Anna University. All rights reserved.',
        tagline: 'Where Strategy Meets Innovation',
        links: [],
    },
};

const ARRAY_EDITOR_KEYS = [
    'aboutMIT.highlights',
    'eventPass.tiers',
    'services.items',
    'faq.items',
    'reachUs.instructions',
    'contact.coordinators',
];

const pad2 = (value) => String(value).padStart(2, '0');

function formatRangeDate(value) {
    if (!value) return '';
    const [year, month, day] = String(value).split('-');
    if (!year || !month || !day) return '';
    return `${day}-${month}-${year}`;
}

function parseRangeDate(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/(\\d{2})-(\\d{2})-(\\d{4})/);
    if (!match) return '';
    return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseDateRangeText(textValue) {
    const parts = String(textValue || '').match(/\d{2}-\d{2}-\d{4}/g) || [];
    return {
        start: parseRangeDate(parts[0] || ''),
        end: parseRangeDate(parts[1] || ''),
    };
}

function formatDateRangeText(start, end) {
    const left = formatRangeDate(start);
    const right = formatRangeDate(end);
    if (left && right) return `${left} — ${right}`;
    if (left) return left;
    if (right) return right;
    return '';
}

function isoToLocalInput(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localInputToIso(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString();
}

function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;
    if (Array.isArray(base)) return Array.isArray(override) ? override : base;
    const output = { ...base };
    Object.keys(override).forEach((key) => {
        const left = base?.[key];
        const right = override[key];
        if (left && typeof left === 'object' && !Array.isArray(left) && right && typeof right === 'object' && !Array.isArray(right)) {
            output[key] = deepMerge(left, right);
        } else {
            output[key] = right;
        }
    });
    return output;
}

function getIn(obj, path) {
    return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function setIn(obj, path, value) {
    const keys = path.split('.');
    const next = JSON.parse(JSON.stringify(obj));
    let ref = next;
    for (let i = 0; i < keys.length - 1; i += 1) {
        const key = keys[i];
        if (typeof ref[key] !== 'object' || ref[key] == null) ref[key] = {};
        ref = ref[key];
    }
    ref[keys[keys.length - 1]] = value;
    return next;
}

function makeArrayEditors(content) {
    const editors = {};
    ARRAY_EDITOR_KEYS.forEach((path) => {
        const value = getIn(content, path);
        editors[path] = JSON.stringify(Array.isArray(value) ? value : [], null, 2);
    });
    return editors;
}

function parseError(error, fallback) {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg || item?.detail || JSON.stringify(item)).join(', ');
    if (detail && typeof detail === 'object') return detail.message || detail.msg || detail.detail || JSON.stringify(detail);
    return detail || fallback;
}

function Section({ title, children }) {
    return (
        <section className="rounded-2xl border border-black/10 bg-white p-4 space-y-3">
            <h2 className="text-lg font-bold">{title}</h2>
            {children}
        </section>
    );
}

export default function ChakravyuhaTmpEditorPage() {
    const { getAuthHeader } = useAuth();
    const headers = useMemo(() => getAuthHeader(), [getAuthHeader]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sympo, setSympo] = useState(null);
    const [content, setContent] = useState(DEFAULT_CONTENT);
    const [arrayEditors, setArrayEditors] = useState(makeArrayEditors(DEFAULT_CONTENT));
    const [heroStartDate, setHeroStartDate] = useState('');
    const [heroEndDate, setHeroEndDate] = useState('');
    const [countdownInput, setCountdownInput] = useState('');
    const [uploadingGalleryId, setUploadingGalleryId] = useState(null);
    const [galleryPage, setGalleryPage] = useState(1);
    const galleryPageSize = 4;

    const loadSympo = useCallback(async () => {
        setLoading(true);
        try {
            const res = await ccAdminApi.listSympos(headers);
            const rows = res.data || [];
            const found = rows.find((row) => String(row?.name || '').trim().toLowerCase() === TARGET_SYMPO_NAME);
            if (!found) {
                toast.error(`Sympo '${TARGET_SYMPO_NAME}' not found`);
                setLoading(false);
                return;
            }
            const merged = deepMerge(DEFAULT_CONTENT, (found.content && typeof found.content === 'object') ? found.content : {});
            setSympo(found);
            setContent(merged);
            setArrayEditors(makeArrayEditors(merged));
            const parsedDates = parseDateRangeText(merged?.hero?.dates || '');
            setHeroStartDate(parsedDates.start);
            setHeroEndDate(parsedDates.end);
            setCountdownInput(isoToLocalInput(merged?.hero?.countdownDate || ''));
        } catch (error) {
            toast.error(parseError(error, 'Failed to load sympo'));
        } finally {
            setLoading(false);
        }
    }, [headers]);

    useEffect(() => {
        loadSympo();
    }, [loadSympo]);

    const setField = (path, value) => setContent((prev) => setIn(prev, path, value));

    const setHeroDateRange = (nextStart, nextEnd) => {
        const datesText = formatDateRangeText(nextStart, nextEnd);
        setField('hero.dates', datesText);
    };

    const addGalleryImage = () => {
        setContent((prev) => {
            const current = Array.isArray(prev?.gallery?.images) ? prev.gallery.images : [];
            const nextId = current.length ? Math.max(...current.map((item) => Number(item.id) || 0)) + 1 : 1;
            return setIn(prev, 'gallery.images', [...current, { id: nextId, url: '', alt: '', category: '' }]);
        });
        setGalleryPage((prev) => prev + 1);
    };

    const updateGalleryImage = (imageId, patch) => {
        setContent((prev) => {
            const images = Array.isArray(prev?.gallery?.images) ? prev.gallery.images : [];
            const next = images.map((item) => (Number(item.id) === Number(imageId) ? { ...item, ...patch } : item));
            return setIn(prev, 'gallery.images', next);
        });
    };

    const removeGalleryImage = (imageId) => {
        setContent((prev) => {
            const images = Array.isArray(prev?.gallery?.images) ? prev.gallery.images : [];
            const next = images.filter((item) => Number(item.id) !== Number(imageId));
            return setIn(prev, 'gallery.images', next);
        });
    };

    const uploadGalleryImage = async (imageId, file) => {
        if (!file) return;
        setUploadingGalleryId(imageId);
        try {
            const processed = await compressImageToWebp(file);
            const url = await uploadPoster(processed, getAuthHeader);
            updateGalleryImage(imageId, { url });
            toast.success('Gallery image uploaded');
        } catch (error) {
            toast.error(parseError(error, 'Gallery upload failed'));
        } finally {
            setUploadingGalleryId(null);
        }
    };

    const save = async () => {
        if (!sympo) return;

        if (countdownInput) {
            const nextCountdownIso = localInputToIso(countdownInput);
            if (!nextCountdownIso) {
                toast.error('Invalid countdown date/time');
                return;
            }
            setField('hero.countdownDate', nextCountdownIso);
        }

        let payloadContent = JSON.parse(JSON.stringify(content));
        if (countdownInput) {
            payloadContent = setIn(payloadContent, 'hero.countdownDate', localInputToIso(countdownInput));
        }
        for (const path of ARRAY_EDITOR_KEYS) {
            const raw = arrayEditors[path] || '[]';
            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch {
                toast.error(`Invalid JSON in ${path}`);
                return;
            }
            if (!Array.isArray(parsed)) {
                toast.error(`${path} must be a JSON array`);
                return;
            }
            payloadContent = setIn(payloadContent, path, parsed);
        }

        setSaving(true);
        try {
            await ccAdminApi.updateSympo(sympo.id, { content: payloadContent }, headers);
            toast.success('Chakravyuha JSON content updated');
            setContent(payloadContent);
        } catch (error) {
            toast.error(parseError(error, 'Failed to update content'));
        } finally {
            setSaving(false);
        }
    };

    const galleryImages = Array.isArray(content?.gallery?.images) ? content.gallery.images : [];
    const galleryTotalPages = Math.max(1, Math.ceil(galleryImages.length / galleryPageSize));
    const safeGalleryPage = Math.min(galleryPage, galleryTotalPages);
    const galleryStart = (safeGalleryPage - 1) * galleryPageSize;
    const pagedGalleryImages = galleryImages.slice(galleryStart, galleryStart + galleryPageSize);

    return (
        <div className="min-h-screen bg-[#f7f5f0] px-4 py-6 text-[#0f1115]">
            <div className="mx-auto w-full max-w-6xl space-y-4">
                <div className="rounded-2xl border border-black/10 bg-white p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Persohub TMP</p>
                        <h1 className="text-2xl font-black">Chakravyuha Content Editor</h1>
                        <p className="text-sm text-slate-600">Target sympo: <span className="font-semibold">{TARGET_SYMPO_NAME}</span></p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={loadSympo} disabled={loading || saving}>Reload</Button>
                        <Button onClick={save} disabled={loading || saving || !sympo}>{saving ? 'Saving...' : 'Save JSON'}</Button>
                    </div>
                </div>

                {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

                <Section title="Hero">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.hero.title || ''} onChange={(e) => setField('hero.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Subtitle</Label><Input value={content.hero.subtitle || ''} onChange={(e) => setField('hero.subtitle', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Tagline</Label><Input value={content.hero.tagline || ''} onChange={(e) => setField('hero.tagline', e.target.value)} /></div>
                        <div className="grid gap-1">
                            <Label>Start Date</Label>
                            <Input
                                type="date"
                                value={heroStartDate}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setHeroStartDate(next);
                                    setHeroDateRange(next, heroEndDate);
                                }}
                            />
                        </div>
                        <div className="grid gap-1">
                            <Label>End Date</Label>
                            <Input
                                type="date"
                                value={heroEndDate}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setHeroEndDate(next);
                                    setHeroDateRange(heroStartDate, next);
                                }}
                            />
                        </div>
                        <div className="grid gap-1"><Label>Dates Display</Label><Input value={content.hero.dates || ''} onChange={(e) => setField('hero.dates', e.target.value)} /></div>
                        <div className="grid gap-1">
                            <Label>Countdown Date & Time</Label>
                            <Input type="datetime-local" value={countdownInput} onChange={(e) => setCountdownInput(e.target.value)} />
                        </div>
                        <div className="grid gap-1"><Label>Register URL</Label><Input value={content.hero.registerUrl || ''} onChange={(e) => setField('hero.registerUrl', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Prize Pool</Label><Input value={content.hero.prizePool || ''} onChange={(e) => setField('hero.prizePool', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Internships</Label><Input value={content.hero.internships || ''} onChange={(e) => setField('hero.internships', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Events</Label><Input value={content.hero.events || ''} onChange={(e) => setField('hero.events', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Participants</Label><Input value={content.hero.participants || ''} onChange={(e) => setField('hero.participants', e.target.value)} /></div>
                    </div>
                </Section>

                <Section title="About Chakravyuha">
                    <div className="grid gap-3">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.aboutChakravyuha.title || ''} onChange={(e) => setField('aboutChakravyuha.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Description 1</Label><Textarea rows={4} value={content.aboutChakravyuha.description || ''} onChange={(e) => setField('aboutChakravyuha.description', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Description 2</Label><Textarea rows={4} value={content.aboutChakravyuha.description2 || ''} onChange={(e) => setField('aboutChakravyuha.description2', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Description 3</Label><Textarea rows={4} value={content.aboutChakravyuha.description3 || ''} onChange={(e) => setField('aboutChakravyuha.description3', e.target.value)} /></div>
                    </div>
                </Section>

                <Section title="About MIT">
                    <div className="grid gap-3">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.aboutMIT.title || ''} onChange={(e) => setField('aboutMIT.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Description 1</Label><Textarea rows={4} value={content.aboutMIT.description || ''} onChange={(e) => setField('aboutMIT.description', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Description 2</Label><Textarea rows={4} value={content.aboutMIT.description2 || ''} onChange={(e) => setField('aboutMIT.description2', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Highlights (JSON Array)</Label><Textarea rows={6} value={arrayEditors['aboutMIT.highlights']} onChange={(e) => setArrayEditors((prev) => ({ ...prev, 'aboutMIT.highlights': e.target.value }))} /></div>
                    </div>
                </Section>

                <Section title="Event Pass">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.eventPass.title || ''} onChange={(e) => setField('eventPass.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Subtitle</Label><Input value={content.eventPass.subtitle || ''} onChange={(e) => setField('eventPass.subtitle', e.target.value)} /></div>
                    </div>
                    <div className="grid gap-1"><Label>Tiers (JSON Array)</Label><Textarea rows={12} value={arrayEditors['eventPass.tiers']} onChange={(e) => setArrayEditors((prev) => ({ ...prev, 'eventPass.tiers': e.target.value }))} /></div>
                </Section>

                <Section title="Services">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.services.title || ''} onChange={(e) => setField('services.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Subtitle</Label><Input value={content.services.subtitle || ''} onChange={(e) => setField('services.subtitle', e.target.value)} /></div>
                    </div>
                    <div className="grid gap-1"><Label>Items (JSON Array)</Label><Textarea rows={10} value={arrayEditors['services.items']} onChange={(e) => setArrayEditors((prev) => ({ ...prev, 'services.items': e.target.value }))} /></div>
                </Section>

                <Section title="Gallery">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.gallery.title || ''} onChange={(e) => setField('gallery.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Subtitle</Label><Input value={content.gallery.subtitle || ''} onChange={(e) => setField('gallery.subtitle', e.target.value)} /></div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-slate-500">
                                Page {safeGalleryPage} / {galleryTotalPages}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setGalleryPage((prev) => Math.max(1, prev - 1))}
                                    disabled={safeGalleryPage <= 1}
                                >
                                    Prev
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setGalleryPage((prev) => Math.min(galleryTotalPages, prev + 1))}
                                    disabled={safeGalleryPage >= galleryTotalPages}
                                >
                                    Next
                                </Button>
                                <Button type="button" variant="outline" onClick={addGalleryImage}>Add Image</Button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            {pagedGalleryImages.map((image) => (
                                <div key={image.id} className="rounded-xl border border-black/10 p-3 space-y-2">
                                    <div className="overflow-hidden rounded-lg border border-black/10 bg-slate-50">
                                        {image.url ? (
                                            <img
                                                src={image.url}
                                                alt={image.alt || 'Gallery image'}
                                                className="h-44 w-full object-cover"
                                            />
                                        ) : (
                                            <div className="h-44 w-full flex items-center justify-center text-xs text-slate-500">
                                                No image uploaded
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        <div className="grid gap-1">
                                            <Label>Category</Label>
                                            <Input value={image.category || ''} onChange={(e) => updateGalleryImage(image.id, { category: e.target.value })} />
                                        </div>
                                        <div className="grid gap-1">
                                            <Label>Alt</Label>
                                            <Input value={image.alt || ''} onChange={(e) => updateGalleryImage(image.id, { alt: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="grid gap-1">
                                        <Label>Upload Image</Label>
                                        <Input
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp"
                                            onChange={(e) => uploadGalleryImage(image.id, e.target.files?.[0])}
                                            disabled={uploadingGalleryId === image.id}
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <Button type="button" variant="destructive" onClick={() => removeGalleryImage(image.id)}>Remove</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Section>

                <Section title="FAQ">
                    <div className="grid gap-3">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.faq.title || ''} onChange={(e) => setField('faq.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Items (JSON Array)</Label><Textarea rows={12} value={arrayEditors['faq.items']} onChange={(e) => setArrayEditors((prev) => ({ ...prev, 'faq.items': e.target.value }))} /></div>
                    </div>
                </Section>

                <Section title="Reach Us">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.reachUs.title || ''} onChange={(e) => setField('reachUs.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Map URL</Label><Input value={content.reachUs.mapUrl || ''} onChange={(e) => setField('reachUs.mapUrl', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Address Line 1</Label><Input value={content.reachUs.address.line1 || ''} onChange={(e) => setField('reachUs.address.line1', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Address Line 2</Label><Input value={content.reachUs.address.line2 || ''} onChange={(e) => setField('reachUs.address.line2', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Address Line 3</Label><Input value={content.reachUs.address.line3 || ''} onChange={(e) => setField('reachUs.address.line3', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Address Line 4</Label><Input value={content.reachUs.address.line4 || ''} onChange={(e) => setField('reachUs.address.line4', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Bus Title</Label><Input value={content.reachUs.busInfo.title || ''} onChange={(e) => setField('reachUs.busInfo.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Bus Timings</Label><Input value={content.reachUs.busInfo.timings || ''} onChange={(e) => setField('reachUs.busInfo.timings', e.target.value)} /></div>
                    </div>
                    <div className="grid gap-1"><Label>Bus Description</Label><Textarea rows={3} value={content.reachUs.busInfo.description || ''} onChange={(e) => setField('reachUs.busInfo.description', e.target.value)} /></div>
                    <div className="grid gap-1"><Label>Instructions (JSON Array)</Label><Textarea rows={8} value={arrayEditors['reachUs.instructions']} onChange={(e) => setArrayEditors((prev) => ({ ...prev, 'reachUs.instructions': e.target.value }))} /></div>
                </Section>

                <Section title="Contact">
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-1"><Label>Title</Label><Input value={content.contact.title || ''} onChange={(e) => setField('contact.title', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Subtitle</Label><Input value={content.contact.subtitle || ''} onChange={(e) => setField('contact.subtitle', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Email</Label><Input value={content.contact.email || ''} onChange={(e) => setField('contact.email', e.target.value)} /></div>
                        <div className="grid gap-1"><Label>Phone</Label><Input value={content.contact.phone || ''} onChange={(e) => setField('contact.phone', e.target.value)} /></div>
                    </div>
                    <div className="grid gap-1"><Label>Coordinators (JSON Array)</Label><Textarea rows={8} value={arrayEditors['contact.coordinators']} onChange={(e) => setArrayEditors((prev) => ({ ...prev, 'contact.coordinators': e.target.value }))} /></div>
                </Section>

                <div className="pb-6">
                    <Button onClick={save} disabled={saving || !sympo}>{saving ? 'Saving...' : 'Save JSON to Sympo'}</Button>
                </div>
            </div>
        </div>
    );
}
