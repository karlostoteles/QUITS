// One Durable Object per account: who you are, your profile and the nights you were part of.
import { DurableObject } from 'cloudflare:workers';
import { SWATCHES, isG } from '../shared/logic.js';

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

export class UserDO extends DurableObject {
  async load() { return (await this.ctx.storage.get('u')) || null; }
  async save(u) { await this.ctx.storage.put('u', u); return u; }

  // First sign-in creates the account; later ones refresh what Google says.
  async upsert(g) {
    let u = await this.load();
    const now = Date.now();
    if (!u) {
      u = {
        uid: g.uid, email: g.email, name: g.name, picture: g.picture, createdAt: now, lastAt: now, invited: false,
        profile: { name: clean(g.given || g.name, 18), contact: '', address: '', color: '', accept: ['USDC'] },
        nights: [],
      };
    } else Object.assign(u, { email: g.email, name: g.name, picture: g.picture, lastAt: now });
    return this.save(u);
  }

  async get() { return this.load(); }

  async setProfile(p) {
    const u = await this.load(); if (!u) return null;
    const q = u.profile;
    if (p.name !== undefined) q.name = clean(p.name, 18);
    if (p.contact !== undefined) q.contact = clean(p.contact, 32);
    if (p.address !== undefined && (p.address === '' || isG(p.address))) q.address = p.address;
    if (p.color !== undefined && (p.color === '' || SWATCHES.includes(p.color))) q.color = p.color;
    if (Array.isArray(p.accept)) { const a = p.accept.filter(x => x === 'EURC' || x === 'USDC'); if (a.length) q.accept = a; }
    return this.save(u);
  }

  async setInvited(code) {
    const u = await this.load(); if (!u) return null;
    u.invited = true; u.invitedWith = code; u.invitedAt = Date.now();
    return this.save(u);
  }

  async addNight({ code, role, pid }) {
    const u = await this.load(); if (!u) return null;
    if (!u.nights.some(n => n.code === code)) {
      u.nights.unshift({ code, role, pid, at: Date.now() });
      u.nights = u.nights.slice(0, 300);
      await this.save(u);
    }
    return u;
  }

  async wipe() { await this.ctx.storage.deleteAll(); return true; }
}
