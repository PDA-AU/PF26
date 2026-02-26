import React from 'react';
import { Instagram, Linkedin, Mail } from 'lucide-react';
import pdaLogo from '@/assets/pda-logo.png';

export default function PdaFooter() {
    return (
        <footer className="mt-auto border-t-2 border-black bg-[#fffdf5] sm:border-t-4">
            <div className="h-1.5 w-full border-b-2 border-black bg-[#FDE047] sm:h-2 sm:border-b-4" />
            <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
                <div className="grid gap-4 md:grid-cols-[1.4fr_1fr] sm:gap-6">
                    <div className="min-w-0 rounded-md border-2 border-black bg-white p-3 shadow-[3px_3px_0px_0px_#000000] sm:border-4 sm:p-5 sm:shadow-[8px_8px_0px_0px_#000000]">
                        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                            <img src={pdaLogo} alt="PDA" className="h-10 w-10 border border-black bg-white object-contain p-1 sm:h-14 sm:w-14 sm:border-2" />
                            <div className="min-w-0">
                                <p className="break-words font-heading text-sm font-black uppercase leading-snug tracking-tight text-black sm:text-lg">
                                    Personality Development Association WEB TEAM
                                </p>
                                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8B5CF6] sm:text-xs sm:tracking-[0.14em]">
                                    Discover Thyself
                                </p>
                                <a
                                    href="mailto:pda@mitindia.edu"
                                    data-testid="pda-footer-mail-link"
                                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-black bg-[#FDE047] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-black shadow-[1px_1px_0px_0px_#000000] transition-[transform,box-shadow] duration-150 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[3px_3px_0px_0px_#000000] sm:w-auto sm:border-2 sm:px-3 sm:text-xs sm:tracking-[0.14em] sm:shadow-neo sm:hover:shadow-[6px_6px_0px_0px_#000000]"
                                >
                                    <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                    pda@mitindia.edu
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="grid min-w-0 gap-2.5 sm:gap-3">
                        <a
                            href="https://www.instagram.com/pda_mit/"
                            target="_blank"
                            rel="noreferrer"
                            data-testid="pda-footer-instagram-link"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-black bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black shadow-[1px_1px_0px_0px_#000000] transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#FDE047] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[3px_3px_0px_0px_#000000] sm:border-2 sm:px-4 sm:py-3 sm:text-xs sm:tracking-[0.14em] sm:shadow-neo sm:hover:shadow-[6px_6px_0px_0px_#000000]"
                        >
                            <Instagram className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            Instagram
                        </a>
                        <a
                            href="https://www.linkedin.com/company/personality-development-association-mit/"
                            target="_blank"
                            rel="noreferrer"
                            data-testid="pda-footer-linkedin-link"
                            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-black bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-black shadow-[1px_1px_0px_0px_#000000] transition-[transform,box-shadow,background-color] duration-150 hover:bg-[#8B5CF6] hover:text-white hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[3px_3px_0px_0px_#000000] sm:border-2 sm:px-4 sm:py-3 sm:text-xs sm:tracking-[0.14em] sm:shadow-neo sm:hover:shadow-[6px_6px_0px_0px_#000000]"
                        >
                            <Linkedin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            LinkedIn
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
