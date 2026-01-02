## Quick Reference for Configuration

| Action | Configuration |
|--------|---------------|
| Run all tests | `{"run_all": true, "include": [], "exclude": []}` |
| Run only specific tests | `{"run_all": false, "include": ["test1.js", "test2.js"], "exclude": []}` |
| Run all except... | `{"run_all": true, "include": [], "exclude": ["test1.js"]}` |
| Run module tests | `{"run_all": false, "include": ["module-name/*"], "exclude": []}` |

The configuration file approach gives you full control without modifying your Docker setup.


## Running Tests

To execute the load tests, use the following command:

```bash
docker compose up --build

```
