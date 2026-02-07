import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export default function PersofestFooter() {
    return (
        <footer className="bg-black text-white py-12 border-t-4 border-primary">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid md:grid-cols-3 gap-8">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-10 h-10 bg-primary border-2 border-white flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-white" />
                            </div>
                            <span className="font-heading font-black text-xl">PERSOFEST'26</span>
                        </div>
                        <p className="text-gray-400">
                            Inter-Department Personality Development Competition
                        </p>
                    </div>
                    <div>
                        <h4 className="font-heading font-bold mb-4">Organized By</h4>
                        <p className="text-gray-400">
                            Personality Development Association<br />
                            Web Team<br />
                            Maras Institute of Technology, Chennai
                        </p>
                    </div>
                    <div>
                        <h4 className="font-heading font-bold mb-4">Quick Links</h4>
                        <div className="space-y-2">
                            <Link to="/" className="block text-gray-400 hover:text-white transition-colors">Home</Link>
                            <Link to="/persofest#about" className="block text-gray-400 hover:text-white transition-colors">About</Link>
                            <Link to="/persofest#rounds" className="block text-gray-400 hover:text-white transition-colors">Rounds</Link>
                           
                        </div>
                    </div>
                </div>
                <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-500">
                    <p>© 2026 Persofest. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
}
