import React from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Linkedin, Mail } from 'lucide-react';
import pdaLogo from '@/assets/pda-logo.png';

export default function PdaFooter() {
    return (
        <footer className="mt-auto border-t-4 border-black bg-[#fffdf5]">
            <div className="h-2 w-full border-b-4 border-black bg-[#FDE047]" />
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
                    <div className="rounded-md border-4 border-black bg-white p-5 shadow-[8px_8px_0px_0px_#000000]">
                        <div className="flex items-start gap-4">
                            <img src={pdaLogo} alt="PDA" className="h-14 w-14 border-2 border-black bg-white object-contain p-1" />
                            <div>
                                <p className="font-heading text-lg font-black uppercase tracking-tight text-black">
                                    Personality Development Association WEB TEAM 💜
                                </p>
                                <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-[#8B5CF6]">
                                    Discover Thyself
                                </p>
                                <a
                                    href="mailto:pda@mitindia.edu"
                                    data-testid="pda-footer-mail-link"
                                    className="mt-3 inline-flex items-center gap-2 rounded-md border-2 border-black bg-[#FDE047] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
                                >
                                    <Mail className="h-4 w-4" />
                                    pda@mitindia.edu
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3">
                        <Link
                            to="/persofest"
                            data-testid="pda-footer-persofest-link"
                            className="inline-flex items-center justify-center rounded-md border-2 border-black bg-white px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#C4B5FD] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
                        >
                            Persofest’26
                        </Link>
                        <a
                            href="https://www.instagram.com/pda_mit/"
                            target="_blank"
                            rel="noreferrer"
                            data-testid="pda-footer-instagram-link"
                            className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-black bg-white px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#FDE047] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
                        >
                            <Instagram className="h-4 w-4" />
                            Instagram
                        </a>
                        <a
                            href="https://www.linkedin.com/company/personality-development-association-mit/"
                            target="_blank"
                            rel="noreferrer"
                            data-testid="pda-footer-linkedin-link"
                            className="inline-flex items-center justify-center gap-2 rounded-md border-2 border-black bg-white px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-black shadow-neo transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#8B5CF6] hover:text-white hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[6px_6px_0px_0px_#000000]"
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
