import { describe, expect, it } from 'vitest';
import { seed } from '../repo/mock';
import { starter } from '../repo/starter';
import { parseBackup } from '../repo/validate';
import { decide, hashText, isBlank, mergeBoth, parseRemoteFile, parseSyncState } from './sync';

const synced = { fileId: 'f1', version: '7', hash: 'abc' };

describe('decide', () => {
  it('creates the file when Drive has none', () => {
    expect(decide('abc', {}, null)).toBe('create');
    expect(decide('abc', synced, null)).toBe('create');
  });

  it('pushes local changes when Drive is as last synced', () => {
    expect(decide('xyz', synced, { id: 'f1', version: '7' })).toBe('push');
    expect(decide('abc', synced, { id: 'f1', version: '7' })).toBe('none');
  });

  it('pulls when only Drive changed', () => {
    expect(decide('abc', synced, { id: 'f1', version: '9' })).toBe('pull');
  });

  it('reports a conflict when both changed', () => {
    expect(decide('xyz', synced, { id: 'f1', version: '9' })).toBe('conflict');
  });

  it('asks on the first sync of a device that has its own data, pulls on a fresh one', () => {
    expect(decide('xyz', {}, { id: 'f1', version: '3' })).toBe('conflict');
    expect(decide('xyz', {}, { id: 'f1', version: '3' }, true)).toBe('pull');
  });

  it('asks instead of undoing an erase when Drive changed meanwhile', () => {
    expect(decide('blank', synced, { id: 'f1', version: '9' }, true)).toBe('conflict');
    expect(decide('blank', synced, { id: 'f1', version: '7' }, true)).toBe('push');
  });

  it('treats a different file as changed', () => {
    expect(decide('abc', synced, { id: 'f2', version: '7' })).toBe('pull');
  });
});

describe('hashText', () => {
  it('is stable and changes with the text', () => {
    expect(hashText('kratos')).toBe(hashText('kratos'));
    expect(hashText('kratos')).not.toBe(hashText('kratoz'));
    expect(hashText('')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('mergeBoth', () => {
  it('keeps workouts from both sides', () => {
    const remote = seed(new Date('2026-10-26T12:00:00Z'));
    const local = structuredClone(remote);
    const mine = structuredClone(local.sessions[0]);
    mine.id = 'mine';
    mine.startedAt = '2026-10-27T08:00:00.000Z';
    local.sessions.unshift(mine);
    const theirs = structuredClone(remote.sessions[0]);
    theirs.id = 'theirs';
    theirs.startedAt = '2026-10-27T18:00:00.000Z';
    remote.sessions.unshift(theirs);

    const merged = mergeBoth(local, remote);
    expect(merged.sessions.length).toBe(remote.sessions.length + 1);
    const starts = merged.sessions.map((s) => s.startedAt);
    expect(starts).toContain(mine.startedAt);
    expect(starts).toContain(theirs.startedAt);
    expect(() => parseBackup(JSON.stringify(merged))).not.toThrow();
  });
});

describe('isBlank', () => {
  it('is true for a fresh install only', () => {
    expect(isBlank(starter())).toBe(true);
    expect(isBlank(seed())).toBe(false);
  });
});

describe('parseSyncState', () => {
  it('keeps valid fields', () => {
    const s = { fileId: 'a-B_1', version: '12', hash: 'k3j9', syncedAt: '2026-10-26T10:00:00.000Z' };
    expect(parseSyncState(s)).toEqual(s);
    expect(parseSyncState({})).toEqual({});
  });

  it('drops hostile or malformed values', () => {
    expect(parseSyncState(null)).toBeNull();
    expect(parseSyncState([])).toBeNull();
    expect(parseSyncState('x')).toBeNull();
    const s = parseSyncState({ fileId: '../x?y', version: 12, hash: '<img src=x onerror=alert(1)>', syncedAt: 'soon' });
    expect(s).toEqual({});
    const proto = parseSyncState(JSON.parse('{"__proto__": {"fileId": "f1"}}'));
    expect(proto).toEqual({});
  });
});

describe('parseRemoteFile', () => {
  it('accepts a Drive file description', () => {
    expect(parseRemoteFile({ id: 'f1', version: '3', name: 'x' })).toEqual({ id: 'f1', version: '3' });
  });

  it('rejects unexpected shapes', () => {
    expect(() => parseRemoteFile({ id: 'f/1', version: '3' })).toThrow();
    expect(() => parseRemoteFile({ id: 'f1', version: 3 })).toThrow();
    expect(() => parseRemoteFile(JSON.parse('{"__proto__": {"id": "f1", "version": "3"}}'))).toThrow();
    expect(() => parseRemoteFile(null)).toThrow();
  });
});
