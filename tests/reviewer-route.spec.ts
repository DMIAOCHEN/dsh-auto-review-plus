import { describe, expect, it, vi } from 'vitest'
import { UNIT_NAME_RE } from '@deepseek-ai/dsh-storage'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  autoReviewPlusDomainSpec,
  reviewerRoute,
  reviewerRouteSchema,
  setReviewerRoute,
  type ReviewerRoute,
  type ReviewerRouteTable,
} from '../src/reviewer-route.ts'

/**
 * In-memory stand-in for the domain's `routes` table. It implements exactly the
 * `ReviewerRouteTable` slice, so passing it is checked against the real surface
 * instead of being asserted into place.
 */
function fakeRouteTable() {
  const records = new Map<SessionId, ReviewerRoute>()
  const get = vi.fn((key: SessionId): ReviewerRoute | undefined => records.get(key))
  const put = vi.fn(async (key: SessionId, value: ReviewerRoute): Promise<void> => {
    records.set(key, value)
  })
  const remove = vi.fn(async (key: SessionId): Promise<boolean> => records.delete(key))
  const table: ReviewerRouteTable = { get, put, delete: remove }
  return { table, records, get, put, remove }
}

const session = SessionId('session-1')
const pinned = { provider: 'zai', model: 'glm-5.3-flash' }

describe('auto review route domain spec', () => {
  it('declares a name the storage unit vocabulary accepts', () => {
    expect(autoReviewPlusDomainSpec.name).toBe('auto_review_plus')
    expect(autoReviewPlusDomainSpec.name).toMatch(UNIT_NAME_RE)
  })

  it('declares version 1 and the per-record layout', () => {
    expect(autoReviewPlusDomainSpec.version).toBe(1)
    expect(autoReviewPlusDomainSpec.layout).toBe('per-record')
  })

  it('declares exactly one table, the routes table, under a legal name', () => {
    // Asserted against the real spec, not a hard-coded literal: a literal
    // `expect('routes').toMatch(UNIT_NAME_RE)` would hold no matter what the
    // spec actually declared.
    const tableNames = Object.keys(autoReviewPlusDomainSpec.tables)
    expect(tableNames).toEqual(['routes'])
    expect(autoReviewPlusDomainSpec.tables.routes).toBeDefined()
    for (const name of tableNames) expect(name).toMatch(UNIT_NAME_RE)
  })

  it('skips an unreadable record instead of failing the whole open', () => {
    // Regenerable preference data: one bad record must not be able to fail the
    // host plugin's mount and thereby disable the authorization gate.
    expect(autoReviewPlusDomainSpec.invalidRecords).toBe('backup-and-skip')
  })
})

describe('reviewerRoute', () => {
  it('reports no pin when the session has no record', () => {
    const { table } = fakeRouteTable()
    expect(reviewerRoute(table, session)).toBeUndefined()
  })

  it('does not treat another session as pinned', async () => {
    const { table } = fakeRouteTable()
    await setReviewerRoute(table, session, pinned)
    expect(reviewerRoute(table, SessionId('session-2'))).toBeUndefined()
  })

  it('reads back the stored route as a detached copy', async () => {
    const { table, records } = fakeRouteTable()
    await setReviewerRoute(table, session, pinned)
    const read = reviewerRoute(table, session)
    expect(read).toEqual(pinned)
    expect(read).not.toBe(records.get(session))
    if (read === undefined) throw new Error('reviewerRoute lost a stored route')
    Object.assign(read, { provider: 'mutated' })
    expect(records.get(session)).toEqual(pinned)
  })
})

describe('setReviewerRoute', () => {
  it('stores a detached copy of the chosen route', async () => {
    const { table, records, put } = fakeRouteTable()
    await setReviewerRoute(table, session, pinned)
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith(session, pinned)
    expect(records.get(session)).toEqual(pinned)
    expect(records.get(session)).not.toBe(pinned)
  })

  it('resets by deleting the record, never by writing a null', async () => {
    const { table, put, remove } = fakeRouteTable()
    await setReviewerRoute(table, session, null)
    expect(remove).toHaveBeenCalledWith(session)
    expect(put).not.toHaveBeenCalled()
  })

  it('tolerates a reset of a session that has no record', async () => {
    const { table, records, remove } = fakeRouteTable()
    expect(records.size).toBe(0)
    await setReviewerRoute(table, session, null)
    expect(remove).toHaveBeenCalledTimes(1)
    await expect(remove.mock.results[0]?.value).resolves.toBe(false)
  })

  it('clears a previously pinned route on reset', async () => {
    const { table } = fakeRouteTable()
    await setReviewerRoute(table, session, pinned)
    expect(reviewerRoute(table, session)).toEqual(pinned)
    await setReviewerRoute(table, session, null)
    expect(reviewerRoute(table, session)).toBeUndefined()
  })
})

describe('reviewerRouteSchema', () => {
  it('accepts a concrete route', () => {
    expect(reviewerRouteSchema.safeParse(pinned).success).toBe(true)
  })

  it('rejects an empty provider or model', () => {
    expect(reviewerRouteSchema.safeParse({ provider: '', model: 'glm-5.3-flash' }).success).toBe(false)
    expect(reviewerRouteSchema.safeParse({ provider: 'zai', model: '' }).success).toBe(false)
  })

  it('rejects extra keys', () => {
    expect(reviewerRouteSchema.safeParse({ ...pinned, extra: 1 }).success).toBe(false)
  })

  it('rejects a stored null, because absence is the reset', () => {
    expect(reviewerRouteSchema.safeParse(null).success).toBe(false)
  })
})
