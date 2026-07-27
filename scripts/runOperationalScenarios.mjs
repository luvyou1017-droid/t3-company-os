const { operationalScenarioDefinitions, runOperationalScenarioRegression } = await import('../src/shared/dev/operationalScenarios.ts')

const results = operationalScenarioDefinitions.map((definition) => {
  const session = runOperationalScenarioRegression(definition.id)
  const failed = session.assertions.filter((assertion) => !assertion.passed)
  return {
    id: definition.id,
    name: definition.name,
    status: session.status,
    passed: session.assertions.length - failed.length,
    total: session.assertions.length,
    failed,
  }
})

for (const result of results) {
  console.log(`${result.status === 'passed' ? 'PASS' : 'FAIL'} ${result.name} (${result.passed}/${result.total})`)
  result.failed.forEach((assertion) => console.log(`  ${assertion.stepId} ${assertion.name}: expected=${assertion.expected}, actual=${assertion.actual}`))
}

const passedAssertions = results.reduce((sum, result) => sum + result.passed, 0)
const totalAssertions = results.reduce((sum, result) => sum + result.total, 0)
console.log(`TOTAL ${passedAssertions}/${totalAssertions} (${Math.round(passedAssertions / totalAssertions * 100)}%)`)

if (results.some((result) => result.status !== 'passed')) process.exitCode = 1
