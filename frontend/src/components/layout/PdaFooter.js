import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Linkedin, Mail } from 'lucide-react';
import pdaLogo from '@/assets/pda-logo.png';

export default function PdaFooter() {
    return (
        <footer className="mt-auto border-t border-black/10 bg-white py-10">
            <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 text-sm text-slate-600 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                <div className="flex items-start gap-4">
                    <img
                        src={pdaLogo}
                        alt="PDA"
                        className="h-12 w-12 rounded-2xl border border-black/10 object-cover"
                    />
                    <div>
                        <p className="font-heading text-lg font-black text-[#0f1115]">
                            Personality Development Association
                        </p>
                        <p className="mt-1 text-sm text-slate-600">Contact us</p>
                        <a
                            href="mailto:pda@mitindia.edu"
                            className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700 hover:text-[#0f1115]"
                        >
                            <Mail className="h-4 w-4" />
                            pda@mitindia.edu
                        </a>
                    </div>
                </div>
                <div className="flex flex-col gap-3 md:items-end">
                    <div className="flex flex-wrap gap-4">
                        <Link to="/persofest" className="font-semibold text-slate-700 hover:text-[#0f1115]">
                            Persofest’26
                        </Link>
                    </div>
                    <div className="flex flex-wrap gap-4 text-slate-700">
                        <a
                            href="https://www.instagram.com/pda_mit/"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 hover:text-[#0f1115]"
                        >
                            <Instagram className="h-4 w-4" />
                            Instagram
                        </a>
                        <a
                            href="https://www.linkedin.com/company/personality-development-association-mit/"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 hover:text-[#0f1115]"
                        >
                            <Linkedin className="h-4 w-4" />
                            LinkedIn
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
