"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const marketingLinks = [
  { label: "Product", href: "/platform" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Intelligence", href: "/#intelligence" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="site-nav wrap">
        <Link href="/" className="brand" aria-label="GPI home" onClick={() => setMenuOpen(false)}>
          <Image src="/gpi-mark.png" alt="" width={36} height={36} priority />
          <span>GPI</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {marketingLinks.map((link) => <Link href={link.href} key={link.label}>{link.label}</Link>)}
        </nav>
        <div className="nav-actions">
          <Link className="nav-demo" href="/platform">View demo <ArrowRight size={14} /></Link>
          <Link className="button button-small" href="/pricing">Get started</Link>
        </div>
        <button className="mobile-menu-button" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {menuOpen && <nav className="mobile-nav" aria-label="Mobile navigation">
        {marketingLinks.map((link) => <Link href={link.href} key={link.label} onClick={() => setMenuOpen(false)}>{link.label}<ArrowRight size={16} /></Link>)}
        <Link href="/platform" className="button" onClick={() => setMenuOpen(false)}>View demo</Link>
      </nav>}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link href="/" className="brand"><Image src="/gpi-mark.png" alt="" width={30} height={30} /><span>GPI</span></Link>
          <p>AI-assisted research.<br />Human-led decisions.</p>
        </div>
        <div><span className="footer-label">Product</span><Link href="/platform">Platform</Link><Link href="/search">Foundation search</Link><Link href="/#intelligence">Intelligence</Link><Link href="/pricing">Pricing</Link></div>
        <div><span className="footer-label">Company</span><Link href="/about">About</Link><a href="mailto:hello@gpi.example">Contact</a></div>
        <div><span className="footer-label">Resources</span><Link href="/platform/foundations">Dataset explorer</Link><Link href="/about#methodology">Methodology</Link><Link href="/login">Sign in</Link></div>
      </div>
      <div className="wrap footer-bottom"><span>© GPI — Grant Prospect Intelligence</span><span>Research with evidence. Decisions with people.</span></div>
    </footer>
  );
}