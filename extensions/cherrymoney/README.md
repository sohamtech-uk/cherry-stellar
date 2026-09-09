# Stellar Laravel extension tests

The extension is loaded into Cherry Money by the assembly script. This directory's Composer project is a separate **test harness**, not the application's dependency manifest.

Run with PHP 8.2 and Composer:

```bash
composer install --no-interaction --prefer-dist
composer audit --format=plain
composer test
```

The lockfile pins the reviewed Laravel 12/Testbench 10 test environment. Tests cover authentication, feature flag, permission and active-company checks, company isolation, quote idempotency, immutable signed payments, failed verification rollback, one-time reconciliation, native draft creation/linking on initiation and invoice-creation rollback. Private Cherry Money code is not fetched by this test job; its purchase model is represented by an explicit contract fixture.

Laravel 10/Testbench 8 cannot currently resolve with Composer's advisory blocking enabled. The test harness therefore targets a supported, patched framework, while the private base's Laravel 10 upgrade remains a separate full-application requirement. Green fixture tests must not be described as a security or compatibility certification of that older base. See [full-base readiness](../../docs/cherrymoney-base.md#extension-ci-and-full-base-readiness).

To refresh the test dependencies deliberately, run `composer update --with-all-dependencies`, audit and test, then commit both the manifest and lockfile. CI installs the committed lock; it must not ignore advisories or skip tests to obtain a green result.
