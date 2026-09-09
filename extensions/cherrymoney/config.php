<?php

return [
    'enabled' => (bool) env('CHERRY_STELLAR_ENABLED', false),
    'verifier_url' => env('CHERRY_STELLAR_VERIFIER_URL', 'http://127.0.0.1:3001'),
];
