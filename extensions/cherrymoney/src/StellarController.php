<?php

namespace App\CherryStellar;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class StellarController extends Controller
{
    public function page()
    {
        return response()->view('cherry-stellar.index')->header('Cache-Control', 'no-store');
    }

    private function query(Request $request)
    {
        return DB::table('cherry_stellar_invoices')->where('company_id', (string) $request->user()->company_id);
    }

    private function verify(array $input): array
    {
        $url = rtrim((string) config('cherry-stellar.verifier_url'), '/');
        // No browser-supplied URL or public verification service. Test data stays in our stack.
        abort_unless(in_array($url, ['http://127.0.0.1:3001', 'http://stellar-verifier:3001'], true), 503, 'Invalid verifier configuration.');
        $response = Http::connectTimeout(3)->timeout(55)->acceptJson()->post($url.'/verify', $input);
        if (!$response->successful()) {
            abort($response->status() === 400 ? 422 : 503, 'Stellar verification could not complete. Check the saved payment before retrying.');
        }
        $result = $response->json();
        abort_unless(is_array($result) && isset($result['id'], $result['status']), 503, 'Invalid verifier response.');
        return $result;
    }

    public function index(Request $request)
    {
        return response()->json($this->query($request)->orderByDesc('created_at')->limit(500)->get()
            ->map(fn ($row) => json_decode($row->payload, true, 512, JSON_THROW_ON_ERROR)))
            ->header('Cache-Control', 'no-store');
    }

    public function create(Request $request)
    {
        $input = $request->validate(['supplier' => 'required|string|max:120', 'country' => 'required|regex:/^[A-Z]{2}$/',
            'amount' => ['required', 'string', 'regex:/^\d{1,5}(\.\d{1,2})?$/'], 'requestId' => 'required|uuid']);
        $result = DB::transaction(function () use ($request, $input) {
            // Serialize creation for this existing company without changing its data.
            DB::table('company')->where('id', $request->user()->company_id)->lockForUpdate()->first();
            $existing = $this->query($request)->where('request_id', $input['requestId'])->first();
            if ($existing) {
                $saved = json_decode($existing->payload, true, 512, JSON_THROW_ON_ERROR);
                abort_unless($saved['supplier'] === trim($input['supplier']) && $saved['country'] === $input['country']
                    && (int) round((float) $input['amount'] * 100) === $saved['pence'], 409);
                return $saved;
            }
            abort_if($this->query($request)->count() >= 500, 422, 'Company demo invoice limit reached.');
            $record = $this->verify(['action' => 'quote', 'input' => $input]);
            DB::table('cherry_stellar_invoices')->insert(['id' => $record['id'], 'company_id' => (string) $request->user()->company_id,
                'request_id' => $input['requestId'], 'hash' => null, 'payload' => json_encode($record, JSON_THROW_ON_ERROR),
                'created_at' => now(), 'updated_at' => now()]);
            return $record;
        });
        return response()->json($result)->header('Cache-Control', 'no-store');
    }

    public function prepare(Request $request, string $id)
    {
        $request->validate(['xdr' => 'required|string|max:16000']);
        return $this->change($request, $id, 'prepare');
    }

    public function confirm(Request $request, string $id)
    {
        return $this->change($request, $id, 'confirm');
    }

    private function change(Request $request, string $id, string $action)
    {
        $result = DB::transaction(function () use ($request, $id, $action) {
            $row = $this->query($request)->where('id', $id)->lockForUpdate()->first();
            abort_unless($row, 404);
            $record = json_decode($row->payload, true, 512, JSON_THROW_ON_ERROR);
            if ($action === 'prepare' && isset($record['xdr'])) {
                abort_unless(hash_equals($record['xdr'], $request->string('xdr')->toString()), 409);
                return $record;
            }
            if (in_array($record['status'], ['reconciled', 'failed'], true)) return $record;
            abort_unless($action === 'prepare' ? $record['status'] === 'quoted' : $record['status'] === 'prepared', 409);
            $verified = $this->verify(['action' => $action, 'record' => $record, 'xdr' => $request->input('xdr')]);
            abort_unless($verified['id'] === $record['id'], 503);
            $this->query($request)->where('id', $id)->update(['hash' => $verified['hash'] ?? null,
                'payload' => json_encode($verified, JSON_THROW_ON_ERROR), 'updated_at' => now()]);
            return $verified;
        });
        return response()->json($result)->header('Cache-Control', 'no-store');
    }
}
