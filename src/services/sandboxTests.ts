/**
 * Docker Sandbox Health Check & Test Suite
 * 
 * This file tests the sandbox to ensure:
 * 1. Docker is accessible
 * 2. Sandbox image builds successfully
 * 3. Code executes in isolation
 * 4. Resource limits are enforced
 * 5. Dangerous operations are blocked
 */

import { dockerSandbox } from './dockerSandbox';

// Test cases
interface TestCase {
    name: string;
    code: string;
    expectedSuccess: boolean;
    description: string;
}

const TEST_CASES: TestCase[] = [
    {
        name: 'simple_calculation',
        code: 'result = 2 + 2',
        expectedSuccess: true,
        description: 'Basic math operation',
    },
    {
        name: 'dataframe_creation',
        code: `
import pandas as pd
df = pd.DataFrame({'a': [1, 2, 3], 'b': [4, 5, 6]})
result = df.sum().to_dict()
`,
        expectedSuccess: true,
        description: 'Create and aggregate dataframe',
    },
    {
        name: 'visualization',
        code: `
import pandas as pd
import matplotlib.pyplot as plt
df = pd.DataFrame({'x': [1, 2, 3], 'y': [1, 4, 9]})
plt.plot(df['x'], df['y'])
result = 'Plot created'
`,
        expectedSuccess: true,
        description: 'Create matplotlib visualization',
    },
    {
        name: 'forbidden_os_import',
        code: 'import os; result = os.system("whoami")',
        expectedSuccess: false,
        description: 'Should block dangerous OS module',
    },
    {
        name: 'forbidden_eval',
        code: 'result = eval("1+1")',
        expectedSuccess: false,
        description: 'Should block eval() function',
    },
    {
        name: 'memory_limit_test',
        code: `
# Create large data structure (should hit memory limit)
data = [str(i) * 1000 for i in range(1000000)]
result = len(data)
`,
        expectedSuccess: false,
        description: 'Memory limit should be enforced',
    },
    {
        name: 'timeout_test',
        code: `
import time
# Infinite loop (should timeout)
while True:
    pass
`,
        expectedSuccess: false,
        description: 'Timeout should be enforced at 30 seconds',
    },
];

/**
 * Run all tests
 */
export async function runAllTests(): Promise<void> {
    console.log('\n🧪 Docker Sandbox Test Suite\n');
    console.log('=' .repeat(60));

    // Check Docker availability first
    const isHealthy = await dockerSandbox.healthCheck();
    if (!isHealthy) {
        console.error('❌ Docker sandbox is not available!');
        console.error('Ensure Docker daemon is running and accessible.');
        process.exit(1);
    }
    console.log('✅ Docker sandbox is healthy\n');

    let passed = 0;
    let failed = 0;

    for (const testCase of TEST_CASES) {
        try {
            console.log(`📋 Test: ${testCase.name}`);
            console.log(`   Description: ${testCase.description}`);
            console.log(`   Expected: ${testCase.expectedSuccess ? 'SUCCESS' : 'FAILURE'}`);

            const result = await dockerSandbox.executeCode(testCase.code, [], {
                timeout: testCase.name === 'timeout_test' ? 5000 : 30000, // Shorter timeout for timeout test
            });

            const testPassed =
                result.success === testCase.expectedSuccess;

            if (testPassed) {
                console.log(`   Result: ✅ PASS\n`);
                passed++;
            } else {
                console.log(
                    `   Result: ❌ FAIL (expected ${testCase.expectedSuccess}, got ${result.success})`
                );
                console.log(`   Output: ${result.output || result.error}\n`);
                failed++;
            }
        } catch (err) {
            console.log(
                `   Result: ❌ ERROR - ${err instanceof Error ? err.message : String(err)}\n`
            );
            failed++;
        }
    }

    // Summary
    console.log('=' .repeat(60));
    console.log(`\n📊 Test Results:`);
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total:  ${passed + failed}`);

    if (failed === 0) {
        console.log('\n✅ All tests passed!\n');
    } else {
        console.log(`\n❌ ${failed} test(s) failed.\n`);
        process.exit(1);
    }
}

/**
 * Quick health check (called on app startup)
 */
export async function quickHealthCheck(): Promise<boolean> {
    try {
        const isHealthy = await dockerSandbox.healthCheck();
        if (isHealthy) {
            console.log('✅ Docker sandbox: READY');
        } else {
            console.log('⚠️  Docker sandbox: NOT READY (Docker not accessible)');
        }
        return isHealthy;
    } catch (err) {
        console.error('❌ Docker sandbox: ERROR', err);
        return false;
    }
}

// Run tests if called directly
if (require.main === module) {
    runAllTests().catch((err) => {
        console.error('Test suite error:', err);
        process.exit(1);
    });
}
