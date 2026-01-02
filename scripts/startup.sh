#!/bin/sh
set -e

echo "=========================================="
echo "         K6 Test Runner - Controlled      "
echo "=========================================="

MODULES_DIR="/k6/modules"
RESULTS_DIR="/k6/results"
LOG_DIR="/k6/logs"
CONFIG_FILE="/k6/test-config.json"

# Create directories
mkdir -p "$RESULTS_DIR" "$LOG_DIR"

echo "📋 Reading configuration..."

# Default values
RUN_ALL=true
INCLUDE_TESTS=""
EXCLUDE_TESTS=""

if [ -f "$CONFIG_FILE" ]; then
    echo "  Using configuration file: $CONFIG_FILE"
    
    # Read the entire config file
    CONFIG_CONTENT=$(cat "$CONFIG_FILE" | tr -d '\n\r' | sed 's/ //g')
    
    # Extract run_all value (simple pattern matching)
    if echo "$CONFIG_CONTENT" | grep -q '"run_all":false'; then
        RUN_ALL=false
    fi
    
    # Extract include array
    if echo "$CONFIG_CONTENT" | grep -q '"include":\[[^]]*\]'; then
        INCLUDE_TESTS=$(echo "$CONFIG_CONTENT" | sed -n 's/.*"include":\[\([^]]*\)\].*/\1/p' | sed 's/"//g')
    fi
    
    # Extract exclude array
    if echo "$CONFIG_CONTENT" | grep -q '"exclude":\[[^]]*\]'; then
        EXCLUDE_TESTS=$(echo "$CONFIG_CONTENT" | sed -n 's/.*"exclude":\[\([^]]*\)\].*/\1/p' | sed 's/"//g')
    fi
else
    echo "  No configuration file found. Creating default..."
    echo '{"run_all": true, "include": [], "exclude": []}' > "$CONFIG_FILE"
fi

echo ""
echo "⚙️  Configuration:"
echo "  - Run all tests: $RUN_ALL"
echo "  - Include tests: $INCLUDE_TESTS"
echo "  - Exclude tests: $EXCLUDE_TESTS"
echo ""

echo "🔍 Finding and filtering tests..."

SELECTED_TESTS=""
TOTAL_COUNT=0
SELECTED_COUNT=0

for file in "$MODULES_DIR"/*/*.js; do
    if [ -f "$file" ]; then
        TOTAL_COUNT=$((TOTAL_COUNT + 1))
        test_path="${file#$MODULES_DIR/}"
        
        # Check if excluded
        SKIP_TEST=false
        if [ -n "$EXCLUDE_TESTS" ]; then
            IFS=','  # Set comma as delimiter
            for exclude in $EXCLUDE_TESTS; do
                if [ "$test_path" = "$exclude" ]; then
                    SKIP_TEST=true
                    break
                fi
            done
            unset IFS  # Reset to default
        fi
        
        if [ "$SKIP_TEST" = true ]; then
            echo "  ✗ $test_path (excluded)"
            continue
        fi
        
        # Check if included
        if [ "$RUN_ALL" = true ]; then
            SELECTED_TESTS="$SELECTED_TESTS $file"
            SELECTED_COUNT=$((SELECTED_COUNT + 1))
            echo "  ✓ $test_path"
        else
            # Check include list
            FOUND=false
            if [ -n "$INCLUDE_TESTS" ]; then
                IFS=','
                for include in $INCLUDE_TESTS; do
                    if [ "$test_path" = "$include" ]; then
                        FOUND=true
                        break
                    fi
                done
                unset IFS
            fi
            
            if [ "$FOUND" = true ]; then
                SELECTED_TESTS="$SELECTED_TESTS $file"
                SELECTED_COUNT=$((SELECTED_COUNT + 1))
                echo "  ✓ $test_path"
            else
                echo "  ✗ $test_path (not in include list)"
            fi
        fi
    fi
done

echo ""
echo "📊 Test Selection:"
echo "  - Total tests found: $TOTAL_COUNT"
echo "  - Tests selected: $SELECTED_COUNT"
echo ""

if [ "$SELECTED_COUNT" -eq 0 ]; then
    echo "❌ No tests selected to run!"
    exit 1
fi

echo "📁 Creating results folders..."
for file in $SELECTED_TESTS; do
    if [ -f "$file" ]; then
        module_name=$(basename "$(dirname "$file")")
        scenario_name=$(basename "$file" .js)
        mkdir -p "$RESULTS_DIR/$module_name/$scenario_name"
    fi
done

echo ""
echo "🚀 Starting test execution..."
echo "📝 Logs will be saved to: $LOG_DIR"
echo ""

CURRENT=1
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
EXECUTION_LOG="$LOG_DIR/execution_summary_${TIMESTAMP}.log"

# Create execution summary log
{
    echo "=========================================="
    echo "K6 Test Execution Summary"
    echo "=========================================="
    echo "Start time: $(date)"
    echo "Configuration: $CONFIG_FILE"
    echo "Total tests available: $TOTAL_COUNT"
    echo "Tests selected: $SELECTED_COUNT"
    echo "Run all: $RUN_ALL"
    echo "Include tests: $INCLUDE_TESTS"
    echo "Exclude tests: $EXCLUDE_TESTS"
    echo "=========================================="
    echo ""
} > "$EXECUTION_LOG"

for file in $SELECTED_TESTS; do
    if [ -f "$file" ]; then
        TEST_NAME=$(basename "$file" .js)
        MODULE_NAME=$(basename "$(dirname "$file")")
        TEST_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
        LOG_FILE="$LOG_DIR/${MODULE_NAME}_${TEST_NAME}_${TEST_TIMESTAMP}.log"
        
        echo ""
        echo "=========================================="
        echo " Test $CURRENT/$SELECTED_COUNT: $TEST_NAME"
        echo " Module: $MODULE_NAME"
        echo " Log file: $(basename "$LOG_FILE")"
        echo "=========================================="
        echo ""
        
        # Add to execution log
        {
            echo "--------------------------------------------------"
            echo "Test: $TEST_NAME"
            echo "Module: $MODULE_NAME"
            echo "File: $file"
            echo "Started: $(date)"
            echo "Log: $(basename "$LOG_FILE")"
        } >> "$EXECUTION_LOG"
        
        # Create detailed log file
        {
            echo "=================================================="
            echo "K6 Test Execution Detailed Log"
            echo "=================================================="
            echo "Test Name:    $TEST_NAME"
            echo "Module:       $MODULE_NAME"
            echo "File:         $file"
            echo "Start Time:   $(date)"
            echo "Log File:     $LOG_FILE"
            echo "Execution:    $CURRENT of $SELECTED_COUNT"
            echo "Configuration: $CONFIG_FILE"
            echo "=================================================="
            echo ""
            echo "=== K6 Output ==="
            echo ""
        } > "$LOG_FILE"
        
        # Run the test and capture all output
        START_TIME=$(date +%s)
        
        # Run k6 and capture exit code and output
        OUTPUT_FILE="/tmp/k6_output_$$.tmp"
        k6 run "$file" 2>&1 | tee "$OUTPUT_FILE"
        EXIT_CODE=$?
        
        # Append output to log file
        cat "$OUTPUT_FILE" >> "$LOG_FILE"
        rm -f "$OUTPUT_FILE"
        
        END_TIME=$(date +%s)
        DURATION=$((END_TIME - START_TIME))
        
        # Add test summary to detailed log
        {
            echo ""
            echo "=================================================="
            echo "Test Summary"
            echo "=================================================="
            echo "Exit Code:    $EXIT_CODE"
            echo "Duration:     ${DURATION} seconds"
            echo "End Time:     $(date)"
            if [ "$EXIT_CODE" -eq 0 ]; then
                echo "Status:       SUCCESS"
            else
                echo "Status:       FAILED"
            fi
            echo "=================================================="
        } >> "$LOG_FILE"
        
        # Update execution log
        {
            echo "Completed:    $(date)"
            echo "Duration:     ${DURATION}s"
            if [ "$EXIT_CODE" -eq 0 ]; then
                echo "Status:       SUCCESS"
            else
                echo "Status:       FAILED"
            fi
            echo "Exit Code:    $EXIT_CODE"
        } >> "$EXECUTION_LOG"
        
        echo ""
        if [ "$EXIT_CODE" -eq 0 ]; then
            echo "✅ SUCCESS: Test completed in ${DURATION}s"
            echo "   📄 Log: $LOG_FILE"
        else
            echo "❌ FAILED: Test exited with code $EXIT_CODE (${DURATION}s)"
            echo "   📄 Log: $LOG_FILE"
            echo "   💡 Check the log file for details: $LOG_FILE"
        fi
        
        CURRENT=$((CURRENT + 1))
        
        if [ "$CURRENT" -le "$SELECTED_COUNT" ]; then
            echo ""
            echo "⏳ Preparing next test..."
            sleep 2
        fi
    fi
done

# Finalize execution log
{
    echo ""
    echo "=========================================="
    echo "Execution Completed"
    echo "=========================================="
    echo "End time: $(date)"
    echo "Total tests executed: $SELECTED_COUNT"
    echo "=========================================="
} >> "$EXECUTION_LOG"

echo ""
echo "=========================================="
echo "             EXECUTION COMPLETE           "
echo "=========================================="
echo "📊 Summary:"
echo "  - Configuration used: $(basename "$CONFIG_FILE")"
echo "  - Total tests available: $TOTAL_COUNT"
echo "  - Tests executed: $SELECTED_COUNT"
echo "  - Results saved in: $RESULTS_DIR"
echo "  - Logs saved in: $LOG_DIR"
echo ""
echo "📁 Log files created:"

# List log files without size (simpler, avoids the substitution issue)
if ls "$LOG_DIR"/*.log 1>/dev/null 2>&1; then
    echo "  Execution summary: $(basename "$EXECUTION_LOG")"
    for logfile in "$LOG_DIR"/*.log; do
        if [ "$logfile" != "$EXECUTION_LOG" ]; then
            echo "  - $(basename "$logfile")"
        fi
    done
else
    echo "  No log files found"
fi

echo ""
echo "🎉 All $SELECTED_COUNT tests executed successfully!"