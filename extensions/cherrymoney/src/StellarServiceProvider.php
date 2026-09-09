<?php

namespace App\CherryStellar;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class StellarServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::middleware(['web', 'auth', StellarAccess::class, 'permission:expense', 'throttle:30,1'])
            ->prefix('stellar')->group(function () {
                Route::get('/', [StellarController::class, 'page'])->name('cherry-stellar.page');
                Route::get('/api/invoices', [StellarController::class, 'index']);
                Route::post('/api/invoices', [StellarController::class, 'create']);
                Route::post('/api/invoices/{id}/prepare', [StellarController::class, 'prepare']);
                Route::post('/api/invoices/{id}/confirm', [StellarController::class, 'confirm']);
            });
    }
}
