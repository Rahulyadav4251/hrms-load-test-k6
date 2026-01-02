import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { USERS } from '../../data/admin_users.js';
import { getToken } from '../../lib/auth.js';
import { BASE_URL } from '../../config/env.js';
import http from 'k6/http';
import { check, sleep } from 'k6';

// Scenario options
export const options = {
    scenarios: {
        create_bulk_users: {
            executor: 'per-vu-iterations',
            vus: 50,
            iterations: 200,
            maxDuration: '30m',
            gracefulStop: '30s',
            startTime: '5s', // Staggered start
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<5000'],
        'checks': ['rate>0.1'],
    },
};

// ========== SETUP: GENERATE VU-SPECIFIC UNIQUE VALUES ==========
export function setup() {
    console.log(`Setup: Using first 50 admin users from ${USERS.length} available`);
    
    // Create a completely different data set for each VU
    // Each VU will use different base numbers to avoid collisions
    const vuDataSets = [];
    
    console.log('Generating VU-specific unique values...');
    
    for (let vuId = 1; vuId <= 50; vuId++) {
        const vuData = {
            vuId: vuId,
            employeeCodes: [],
            mobileNumbers: [],
            personalEmails: [],
            officialEmails: [],
            aadharNumbers: [],
            panNumbers: [],
            biometricCodes: [],
        };
        
        // Use different starting points for each VU
        const vuOffset = vuId * 1000000; // Large offset to ensure separation
        const mobilePrefix = 98760 + (vuId % 10); // Different prefixes per VU
        
        for (let i = 1; i <= 200; i++) {
            const userSeq = ((vuId - 1) * 200) + i;
            
            // Employee Code - VU-specific prefix
            vuData.employeeCodes.push(`VU${String(vuId).padStart(2, '0')}EMP${String(i).padStart(4, '0')}`);
            
            // Mobile Number - Different prefix per VU + unique sequence
            const mobileSuffix = String(10000 + userSeq + vuOffset).slice(-5);
            vuData.mobileNumbers.push(`${mobilePrefix}${mobileSuffix}`);
            
            // Personal Email - VU-specific domain
            vuData.personalEmails.push(`vu${vuId}_user${String(i).padStart(4, '0')}@testdomain${vuId % 5}.com`);
            
            // Official Email - VU-specific domain
            vuData.officialEmails.push(`emp_vu${vuId}_${String(i).padStart(4, '0')}@company${vuId % 3}.com`);
            
            // Aadhar Number - Different starting digits per VU
            const aadharBase = 299400000000 + (vuId * 2000000) + (i * 100);
            vuData.aadharNumbers.push(String(aadharBase).slice(0, 12));
            
            // PAN Number - Different patterns per VU
            const panLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const firstLetter = panLetters[(vuId - 1) % 26];
            const secondLetter = panLetters[Math.floor(i / 10) % 26];
            const panNumber = `${firstLetter}${secondLetter}PT${String(1000 + ((vuId * 10) + i) % 1000).slice(-4)}A`;
            vuData.panNumbers.push(panNumber);
            
            // Biometric Code
            vuData.biometricCodes.push(`BIO_VU${String(vuId).padStart(2, '0')}_${String(i).padStart(4, '0')}`);
        }
        
        // Verify uniqueness within this VU's data
        const verifyUnique = (fieldName, array) => {
            const set = new Set(array);
            if (set.size !== array.length) {
                console.log(`❌ VU ${vuId}: ${fieldName} has ${array.length - set.size} duplicates!`);
                return false;
            }
            return true;
        };
        
        verifyUnique('employeeCodes', vuData.employeeCodes);
        verifyUnique('mobileNumbers', vuData.mobileNumbers);
        verifyUnique('aadharNumbers', vuData.aadharNumbers);
        
        vuDataSets.push(vuData);
    }
    
    // Cross-check across all VUs to ensure no collisions
    console.log('\nCross-verifying across all VUs...');
    const globalSets = {
        employeeCodes: new Set(),
        mobileNumbers: new Set(),
        aadharNumbers: new Set(),
    };
    
    let hasCollisions = false;
    vuDataSets.forEach((vuData, vuId) => {
        vuData.employeeCodes.forEach(code => {
            if (globalSets.employeeCodes.has(code)) {
                console.log(`❌ COLLISION: Employee Code "${code}" in VU ${vuId + 1}`);
                hasCollisions = true;
            }
            globalSets.employeeCodes.add(code);
        });
        
        vuData.mobileNumbers.forEach(mobile => {
            if (globalSets.mobileNumbers.has(mobile)) {
                console.log(`❌ COLLISION: Mobile "${mobile}" in VU ${vuId + 1}`);
                hasCollisions = true;
            }
            globalSets.mobileNumbers.add(mobile);
        });
        
        vuData.aadharNumbers.forEach(aadhar => {
            if (globalSets.aadharNumbers.has(aadhar)) {
                console.log(`❌ COLLISION: Aadhar "${aadhar}" in VU ${vuId + 1}`);
                hasCollisions = true;
            }
            globalSets.aadharNumbers.add(aadhar);
        });
    });
    
    if (hasCollisions) {
        console.log('\n⚠️  WARNING: Collisions detected in pre-generated data!');
        console.log('Trying alternative generation method...');
        return generateFallbackData(USERS);
    }
    
    console.log(`✅ Generated ${globalSets.employeeCodes.size} unique employee codes`);
    console.log(`✅ Generated ${globalSets.mobileNumbers.size} unique mobile numbers`);
    console.log(`✅ Generated ${globalSets.aadharNumbers.size} unique Aadhar numbers`);
    
    console.log('\nSample values from different VUs:');
    console.log(`VU 1 Employee Codes: ${vuDataSets[0].employeeCodes.slice(0, 3).join(', ')}`);
    console.log(`VU 2 Employee Codes: ${vuDataSets[1].employeeCodes.slice(0, 3).join(', ')}`);
    console.log(`VU 1 Mobile Numbers: ${vuDataSets[0].mobileNumbers.slice(0, 3).join(', ')}`);
    console.log(`VU 2 Mobile Numbers: ${vuDataSets[1].mobileNumbers.slice(0, 3).join(', ')}`);
    
    return {
        adminUsers: USERS.slice(0, 50),
        vuDataSets: vuDataSets,
    };
}

// Fallback data generation if collisions occur
function generateFallbackData(adminUsers) {
    console.log('Using fallback data generation with high randomization...');
    
    const fallbackData = {
        adminUsers: adminUsers.slice(0, 50),
        vuDataSets: [],
    };
    
    const usedValues = {
        employeeCodes: new Set(),
        mobileNumbers: new Set(),
        aadharNumbers: new Set(),
    };
    
    for (let vuId = 1; vuId <= 50; vuId++) {
        const vuData = {
            vuId: vuId,
            employeeCodes: [],
            mobileNumbers: [],
            personalEmails: [],
            officialEmails: [],
            aadharNumbers: [],
            panNumbers: [],
            biometricCodes: [],
        };
        
        for (let i = 1; i <= 200; i++) {
            // Generate with high randomness
            const timestamp = Date.now() + (vuId * 1000) + i;
            
            // Employee Code - random-based
            let empCode;
            do {
                const randomPart = Math.floor(Math.random() * 1000000);
                empCode = `EMP${String(randomPart).padStart(6, '0')}_V${vuId}`;
            } while (usedValues.employeeCodes.has(empCode));
            usedValues.employeeCodes.add(empCode);
            vuData.employeeCodes.push(empCode);
            
            // Mobile Number - random-based
            let mobile;
            do {
                const prefix = 98760 + Math.floor(Math.random() * 10);
                const suffix = String(10000 + Math.floor(Math.random() * 90000)).slice(-5);
                mobile = `${prefix}${suffix}`;
            } while (usedValues.mobileNumbers.has(mobile));
            usedValues.mobileNumbers.add(mobile);
            vuData.mobileNumbers.push(mobile);
            
            // Aadhar Number - random-based
            let aadhar;
            do {
                const base = 299400000000 + Math.floor(Math.random() * 1000000000);
                aadhar = String(base).slice(0, 12);
            } while (usedValues.aadharNumbers.has(aadhar));
            usedValues.aadharNumbers.add(aadhar);
            vuData.aadharNumbers.push(aadhar);
            
            // Emails - timestamp based
            vuData.personalEmails.push(`user_${timestamp}_vu${vuId}_${i}@gmail.com`);
            vuData.officialEmails.push(`emp_${timestamp}_vu${vuId}_${i}@company.com`);
            
            // PAN - random
            const panLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const firstLetter = panLetters[Math.floor(Math.random() * 26)];
            const secondLetter = panLetters[Math.floor(Math.random() * 26)];
            const panNumber = `${firstLetter}${secondLetter}PT${String(1000 + Math.floor(Math.random() * 9000)).slice(-4)}A`;
            vuData.panNumbers.push(panNumber);
            
            // Biometric Code
            vuData.biometricCodes.push(`BIO_${timestamp}_VU${vuId}_${i}`);
        }
        
        fallbackData.vuDataSets.push(vuData);
    }
    
    console.log(`✅ Fallback: Generated ${usedValues.employeeCodes.size} unique values`);
    return fallbackData;
}

// ========== GET VU-SPECIFIC DATA ==========
function getVUData(data, vuId) {
    // VU IDs are 1-based in k6
    return data.vuDataSets[vuId - 1];
}

// ========== GENERATE USER DATA ==========
function generateUserData(vuData, iteration) {
    // iteration is 0-based
    const index = iteration;
    
    return {
        prefix: iteration % 2 === 0 ? "MR" : "MS",
        first_name: `User${vuData.vuId}_${String(iteration + 1).padStart(3, '0')}`,
        middle_name: `M${vuData.vuId}_${iteration + 1}`,
        last_name: `LastName${vuData.vuId}_${iteration + 1}`,
        employee_code: vuData.employeeCodes[index],
        father_name: `Father${vuData.vuId}_${iteration + 1}`,
        spouse_name: `Spouse${vuData.vuId}_${iteration + 1}`,
        official_email: vuData.officialEmails[index],
        personal_email: vuData.personalEmails[index],
        gender: iteration % 2 === 0 ? "MALE" : "FEMALE",
        mobile_number: vuData.mobileNumbers[index],
        date_of_birth: "2003-02-20T00:00:00.000Z",
        date_of_joining: "2025-12-10T00:00:00.000Z",
        date_of_probation: "2025-12-10T00:00:00.000Z",
        date_of_confirmation: "2026-06-10T00:00:00.000Z",
        scheduled_confirmation_date: "2026-06-10T00:00:00.000Z",
        aadhar_number: vuData.aadharNumbers[index],
        pan_number: vuData.panNumbers[index],
        pf_applicable: "No",
        pension_applicable: "No",
        lwf_applicable: "No",
        pt_applicable: "No",
        esic_applicable: "No",
        biometric_code: vuData.biometricCodes[index],
        employee_type: "PERMANENT",
        currency: "INR",
        attendance_marking_mode: "BIOMETRIC",
        department_id: 32,
        designation_fid: 34,
        role_fid: 3,
        division_id: 18,
        grade_id: 11,
        employee_category_id: 8,
        company_setting_id: 1,
        manager_fid: 10,
        company_reg_fid: 1,
        location_id: 12,
        shift_id: 11,
        calculation_table_fid: 1,
        password: "Test@123456",
    };
}

// ========== MAIN FUNCTION ==========
export default function (data) {
    const { adminUsers, vuDataSets } = data;
    const vuId = __VU;
    
    if (vuId > vuDataSets.length) {
        console.log(`VU ${vuId}: No data available for this VU`);
        return;
    }
    
    const adminIndex = (vuId - 1) % adminUsers.length;
    const admin = adminUsers[adminIndex];
    const vuData = vuDataSets[vuId - 1];
    
    if (!admin) {
        console.log(`VU ${vuId}: No admin user available`);
        return;
    }
    
    // Get token with retry
    let tokenResult;
    for (let attempt = 0; attempt < 3; attempt++) {
        tokenResult = getToken(BASE_URL, admin.username, admin.password);
        if (tokenResult.success) break;
        sleep(1 + attempt); // Exponential backoff
    }
    
    if (!tokenResult || !tokenResult.success) {
        console.log(`VU ${vuId}: Failed to get token for ${admin.username}`);
        return;
    }
    
    const headers = {
        Authorization: tokenResult.token,
        'Content-Type': 'application/json',
        'X-VU-ID': vuId.toString(),
    };
    
    let createdCount = 0;
    let failedCount = 0;
    let consecutiveFailures = 0;
    
    console.log(`\nVU ${vuId}: STARTING with admin ${admin.username}`);
    console.log(`VU ${vuId}: Unique Employee Codes: ${vuData.employeeCodes.slice(0, 3).join(', ')}...`);
    console.log(`VU ${vuId}: Unique Mobiles: ${vuData.mobileNumbers.slice(0, 3).join(', ')}...`);
    
    // Each VU creates 200 users with its own unique data
    for (let iteration = 0; iteration < 200; iteration++) {
        const userNumber = ((vuId - 1) * 200) + iteration + 1;
        
        // Progress indicator
        if (iteration % 20 === 0 && iteration > 0) {
            console.log(`VU ${vuId}: Progress ${iteration}/200 (Created: ${createdCount}, Failed: ${failedCount})`);
        }
        
        const userData = generateUserData(vuData, iteration);
        
        try {
            const res = http.post(
                `${BASE_URL}/v1/employee-central/profile/employee-information/create`,
                JSON.stringify(userData),
                { 
                    headers: headers, 
                    timeout: '60s',
                    tags: { 
                        vu: vuId.toString(), 
                        iteration: iteration.toString(),
                        employee_code: userData.employee_code 
                    }
                }
            );
            
            const checkName = `vu${vuId}_user${iteration + 1}_created`;
            const checkResult = check(res, {
                [checkName]: r => r.status === 200 || r.status === 201,
            });
            
            if (checkResult) {
                createdCount++;
                consecutiveFailures = 0;
                
                if ((iteration + 1) % 50 === 0) {
                    console.log(`✅ VU ${vuId}: Created user ${iteration + 1}/${200}`);
                    console.log(`   Code: ${userData.employee_code}, Mobile: ${userData.mobile_number}`);
                }
            } else {
                failedCount++;
                consecutiveFailures++;
                
                console.log(`❌ VU ${vuId}: FAILED user ${iteration + 1}, Status: ${res.status}`);
                console.log(`   Employee Code: ${userData.employee_code}`);
                console.log(`   Mobile: ${userData.mobile_number}`);
                console.log(`   Aadhar: ${userData.aadhar_number}`);
                
                if (res.body) {
                    try {
                        const error = JSON.parse(res.body);
                        const errorMsg = error.message || JSON.stringify(error).slice(0, 300);
                        console.log(`   Error: ${errorMsg}`);
                        
                        // Check for specific duplicate errors
                        if (errorMsg.includes('Employee code') || errorMsg.includes('employee code')) {
                            console.log(`   🚨 POSSIBLE DATABASE ISSUE: Employee code "${userData.employee_code}" already exists!`);
                            console.log(`   This suggests data from previous tests may still exist.`);
                        }
                        if (errorMsg.includes('Mobile') || errorMsg.includes('mobile')) {
                            console.log(`   🚨 POSSIBLE DATABASE ISSUE: Mobile "${userData.mobile_number}" already exists!`);
                        }
                        if (errorMsg.includes('Aadhar') || errorMsg.includes('aadhar')) {
                            console.log(`   🚨 POSSIBLE DATABASE ISSUE: Aadhar "${userData.aadhar_number}" already exists!`);
                        }
                    } catch {
                        console.log(`   Response: ${res.body.slice(0, 200)}`);
                    }
                }
                
                // Adaptive backoff based on failures
                if (consecutiveFailures >= 3) {
                    const backoffTime = Math.min(consecutiveFailures * 3, 15);
                    console.log(`VU ${vuId}: ${consecutiveFailures} consecutive failures, backing off for ${backoffTime}s`);
                    sleep(backoffTime);
                    
                    // Try to refresh token after many failures
                    if (consecutiveFailures >= 5) {
                        const newToken = getToken(BASE_URL, admin.username, admin.password);
                        if (newToken.success) {
                            headers.Authorization = newToken.token;
                            console.log(`VU ${vuId}: Token refreshed`);
                        }
                    }
                }
            }
        } catch (error) {
            failedCount++;
            consecutiveFailures++;
            console.log(`💥 VU ${vuId}: EXCEPTION for user ${iteration + 1}: ${error.message}`);
            sleep(3); // Longer pause on exception
        }
        
        // Randomized delay with increasing interval for higher VU IDs
        const baseDelay = 0.3 + (vuId * 0.01); // VU 1: 0.31s, VU 50: 0.8s
        const failurePenalty = consecutiveFailures * 0.2;
        const randomJitter = Math.random() * 0.4;
        const totalDelay = baseDelay + failurePenalty + randomJitter;
        sleep(totalDelay);
        
        // Strategic pause
        if (iteration > 0 && iteration % 40 === 0) {
            const pauseTime = 1 + (vuId % 3);
            console.log(`VU ${vuId}: Strategic pause of ${pauseTime}s after ${iteration} users`);
            sleep(pauseTime);
        }
    }
    
    const successRate = createdCount > 0 ? (createdCount / 200 * 100).toFixed(1) : '0.0';
    console.log(`\nVU ${vuId}: COMPLETED - Success: ${createdCount}/200 (${successRate}%)`);
    
    return {
        vuId: vuId,
        created: createdCount,
        failed: failedCount,
        successRate: parseFloat(successRate),
        sampleEmployeeCode: vuData.employeeCodes[0],
        sampleMobile: vuData.mobileNumbers[0],
    };
}

// ========== ENHANCED SUMMARY ==========
export function handleSummary(data) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Calculate metrics
    const totalIterations = data.metrics.iterations.values.count || 0;
    const totalChecks = Object.values(data.metrics.checks.values.rate || {}).reduce((a, b) => a + b, 0);
    const successRate = totalIterations > 0 ? (totalChecks / totalIterations) * 100 : 0;
    
    // Enhanced summary with VU-specific insights
    const enhancedData = {
        ...data,
        custom_summary: {
            timestamp: new Date().toISOString(),
            test_duration: `${(data.state.testRunDuration / 1000000000).toFixed(2)}s`,
            total_attempts: totalIterations,
            estimated_success_rate: successRate.toFixed(2) + '%',
            vus_deployed: 50,
            target_users_per_vu: 200,
            total_target_users: 10000,
            data_generation_strategy: 'VU-specific unique data generation',
            uniqueness_guarantee: 'Each VU has completely different data sets',
            verification: 'Cross-VU collision detection performed',
        }
    };
    
    // Console report
    console.log('\n' + '='.repeat(80));
    console.log('🚀 BULK USER CREATION TEST - FINAL REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📊 EXECUTION SUMMARY:`);
    console.log(`   Total Attempts: ${enhancedData.custom_summary.total_attempts}`);
    console.log(`   Estimated Success Rate: ${enhancedData.custom_summary.estimated_success_rate}`);
    console.log(`   Test Duration: ${enhancedData.custom_summary.test_duration}`);
    
    console.log(`\n⚙️  CONFIGURATION:`);
    console.log(`   VUs Deployed: ${enhancedData.custom_summary.vus_deployed}`);
    console.log(`   Target per VU: ${enhancedData.custom_summary.target_users_per_vu} users`);
    console.log(`   Total Target: ${enhancedData.custom_summary.total_target_users} users`);
    
    console.log(`\n🔐 UNIQUENESS STRATEGY:`);
    console.log(`   Method: ${enhancedData.custom_summary.data_generation_strategy}`);
    console.log(`   Guarantee: ${enhancedData.custom_summary.uniqueness_guarantee}`);
    console.log(`   Verification: ${enhancedData.custom_summary.verification}`);
    
    // Performance metrics
    if (data.metrics.http_req_duration) {
        const avgMs = (data.metrics.http_req_duration.values.avg / 1000).toFixed(2);
        const p95Ms = (data.metrics.http_req_duration.values['p(95)'] / 1000).toFixed(2);
        console.log(`\n⏱️  PERFORMANCE:`);
        console.log(`   Average Response: ${avgMs}ms`);
        console.log(`   95th Percentile: ${p95Ms}ms`);
    }
    
    // Recommendations
    console.log(`\n💡 RECOMMENDATIONS:`);
    if (successRate < 30) {
        console.log(`   1. Database may contain existing test data - consider cleanup`);
        console.log(`   2. Check database unique constraints and indexes`);
        console.log(`   3. Reduce VU count to 20-30 for initial testing`);
        console.log(`   4. Verify API endpoint is working correctly`);
        console.log(`   5. Check server logs for detailed error messages`);
    } else if (successRate < 70) {
        console.log(`   1. Moderate performance - monitor database connections`);
        console.log(`   2. Consider implementing request retry logic`);
        console.log(`   3. Increase delays between requests`);
        console.log(`   4. Check server response times under load`);
    } else {
        console.log(`   1. Good success rate - test validated`);
        console.log(`   2. Consider increasing load for stress testing`);
        console.log(`   3. Monitor database performance metrics`);
    }
    
    console.log(`\n🔍 TROUBLESHOOTING TIPS:`);
    console.log(`   • Each VU uses completely different data prefixes`);
    console.log(`   • Mobile numbers have different prefixes per VU`);
    console.log(`   • Aadhar numbers have large offsets between VUs`);
    console.log(`   • Employee codes include VU identifier`);
    console.log(`   • If duplicates occur, database cleanup may be needed`);
    
    console.log('='.repeat(80));
    
    return {
        [`results/employee-central/createBulkUsers/summary_${timestamp}.json`]: JSON.stringify(enhancedData, null, 2),
        [`results/employee-central/createBulkUsers/report_${timestamp}.html`]: htmlReport(data),
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    };
}

export function teardown() {
    console.log('\n🧹 Test teardown complete.');
    console.log('📝 Check the summary files for detailed results.');
}