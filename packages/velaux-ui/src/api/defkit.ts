import type { DefKitSource } from '@velaux/data';
import { getDomain } from '../utils/common';
import { defkit } from './productionLink';
import { get, post, put, rdelete } from './request';

const base = getDomain().APIBASE + defkit;

export function listDefKitModules() {
  return get(base, {}).then((res) => res);
}

export function detailDefKitModule(name: string) {
  return get(`${base}/${name}`, {}).then((res) => res);
}

export function createDefKitModule(name: string, source: DefKitSource) {
  return post(base, { name, ...source }).then((res) => res);
}

export function updateDefKitModule(name: string, source: DefKitSource) {
  return put(`${base}/${name}`, source).then((res) => res);
}

export function deleteDefKitModule(name: string) {
  return rdelete(`${base}/${name}`, {}).then((res) => res);
}

export function previewDefKitModule(name: string) {
  return get(`${base}/${name}/preview`, {}).then((res) => res);
}

// applyDefKitPreview applies a module's pending render: the conflicts named are
// taken over, the rest skipped; the removed definitions named are deleted.
export function applyDefKitPreview(name: string, takeOver: string[], remove: string[]) {
  return post(`${base}/${name}/apply`, { takeOver, delete: remove }).then((res) => res);
}
