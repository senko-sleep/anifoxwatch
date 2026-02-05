import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Github, Twitter, MessageCircle } from 'lucide-react';

export const Footer = () => {
  return (
    <footer className="border-t border-border bg-fox-darker">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Logo size="md" />
            <p className="mt-4 text-sm text-muted-foreground">
              Your ultimate destination for anime streaming with support for subs and dubs.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <a
                href="#"
                className="p-2 rounded-lg bg-fox-surface hover:bg-fox-orange/20 hover:text-fox-orange transition-colors"
              >
                <Github className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="p-2 rounded-lg bg-fox-surface hover:bg-fox-orange/20 hover:text-fox-orange transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="p-2 rounded-lg bg-fox-surface hover:bg-fox-orange/20 hover:text-fox-orange transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold mb-4">Browse</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/browse" className="hover:text-fox-orange transition-colors">All Anime</Link></li>
              <li><Link to="/genres" className="hover:text-fox-orange transition-colors">Genres</Link></li>
              <li><Link to="/seasonal" className="hover:text-fox-orange transition-colors">Seasonal</Link></li>
              <li><Link to="/popular" className="hover:text-fox-orange transition-colors">Popular</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/docs" className="hover:text-fox-orange transition-colors">API Docs</Link></li>
              <li><Link to="/status" className="hover:text-fox-orange transition-colors">System Status</Link></li>
              <li><Link to="/schedule" className="hover:text-fox-orange transition-colors">Airing Schedule</Link></li>
              <li><a href="#" className="hover:text-fox-orange transition-colors">Support</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-fox-orange transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-fox-orange transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-fox-orange transition-colors">DMCA</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border">
          <p className="text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} AniFox. All rights reserved.
            <span className="mx-2">•</span>
            Made with <span className="text-fox-orange">♥</span> for anime fans
          </p>
        </div>
      </div>
    </footer>
  );
};
