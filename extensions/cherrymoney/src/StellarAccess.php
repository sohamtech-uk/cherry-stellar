<?php

namespace App\CherryStellar;

use Closure;
use Illuminate\Http\Request;

class StellarAccess
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless(config('cherry-stellar.enabled'), 404);
        $user = $request->user();
        abort_unless($user && $user->company_id && $user->hasPermission('expense'), 403);
        $company = $user->getCompany();
        abort_unless($company && (string) $company->id === (string) $user->company_id && (int) $company->status !== 1, 403);
        // Exceptions deliberately propagate; Stellar access must never fail open.
        return $next($request);
    }
}
