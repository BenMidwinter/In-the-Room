import { describe, expect, it } from 'vitest'
import {
  buildComplianceActivityData,
  buildOrgPulseData,
  buildServiceLeadOverview,
  buildSitePerformanceData,
} from './serviceLeadBlocks'

describe('serviceLeadBlocks', () => {
  it('builds org pulse with workplace and clinician counts', () => {
    const pulse = buildOrgPulseData('user-daniel')
    expect(pulse.kpis.workplaces).toBeGreaterThan(0)
    expect(pulse.kpis.clinicians).toBeGreaterThan(0)
    expect(pulse.weekLabel).toBeTruthy()
  })

  it('builds site performance rows without client names', () => {
    const { workplaceRows } = buildSitePerformanceData('user-daniel')
    expect(workplaceRows.length).toBeGreaterThan(0)
    expect(workplaceRows[0]).toHaveProperty('name')
    expect(workplaceRows[0]).not.toHaveProperty('clientName')
  })

  it('builds de-identified compliance activity aggregates', () => {
    const activity = buildComplianceActivityData('user-daniel')
    expect(activity.outcomeBars).toHaveLength(3)
    expect(activity.caseloadByWorkplace.every(row => row.workplaceName && !row.clientName)).toBe(true)
    expect(activity.sessionGroups.every(g => (
      g.workplaceName && typeof g.sessionCount === 'number' && !g.clientId
    ))).toBe(true)
  })

  it('composes full service lead overview', () => {
    const overview = buildServiceLeadOverview('user-daniel')
    expect(overview.pulse).toBeDefined()
    expect(overview.sitePerformance).toBeDefined()
    expect(overview.complianceActivity).toBeDefined()
    expect(overview.weekLabel).toBeTruthy()
    expect(overview.complianceActivity.outcomeBars).toHaveLength(3)
    expect(overview.complianceActivity.outcomeBars.every(bar => typeof bar.pct === 'number')).toBe(true)
  })

  it('orders compliance exceptions by severity', () => {
    const { exceptions } = buildComplianceActivityData('user-daniel')
    if (exceptions.length < 2) return
    const severity = row => row.notesMissing + row.notesLate + row.didNotAttend
    expect(severity(exceptions[0])).toBeGreaterThanOrEqual(severity(exceptions[1]))
  })

  it('limits upcoming session groups to ten items', () => {
    const { sessionGroups } = buildComplianceActivityData('user-daniel')
    expect(sessionGroups.length).toBeLessThanOrEqual(10)
  })
})
