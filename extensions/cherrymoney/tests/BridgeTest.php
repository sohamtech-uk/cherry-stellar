<?php

use App\CherryStellar\StellarServiceProvider;
use Illuminate\Auth\GenericUser;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Orchestra\Testbench\TestCase;

class BridgeUser extends GenericUser
{
    public function hasPermission($permission) { return $this->allowed; }
    public function getCompany() { return (object) ['id' => $this->company_id, 'status' => $this->disabled ? 1 : 0]; }
}
class BasePermissionFixture
{
    public function handle($request, $next, $permission) { return $next($request); }
}

class BridgeTest extends TestCase
{
    protected function getPackageProviders($app) { return [StellarServiceProvider::class]; }
    protected function defineEnvironment($app)
    {
        $app['config']->set('app.key', 'base64:'.base64_encode(str_repeat('test', 8)));
        $app['config']->set('database.default', 'testing');
        $app['config']->set('database.connections.testing', ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']);
        $app['config']->set('cherry-stellar.enabled', true);
        $app['config']->set('cherry-stellar.verifier_url', 'http://127.0.0.1:3001');
        $app['router']->aliasMiddleware('permission', BasePermissionFixture::class);
    }
    protected function setUp(): void
    {
        parent::setUp();
        Schema::create('company', function (Blueprint $table) { $table->string('id')->primary(); });
        DB::table('company')->insert([['id' => 'one'], ['id' => 'two']]);
        (require __DIR__.'/../migrations/2026_09_09_100000_create_cherry_stellar_invoices.php')->up();
        Http::preventStrayRequests();
    }
    private function loginAs(string $company = 'one', bool $allowed = true, bool $disabled = false): void
    {
        $this->actingAs(new BridgeUser(['id' => $company, 'company_id' => $company, 'allowed' => $allowed, 'disabled' => $disabled]));
    }
    private function input(): array
    {
        return ['supplier' => 'Fictional Supplier', 'country' => 'PT', 'amount' => '1', 'requestId' => '12345678-1234-4234-8234-123456789abc'];
    }
    private function record(): array
    {
        return ['id' => '98765432-1234-4234-8234-123456789abc', 'requestId' => $this->input()['requestId'],
            'supplier' => 'Fictional Supplier', 'country' => 'PT', 'pence' => 100, 'status' => 'quoted', 'journal' => []];
    }
    private function insertRecord(array $record): void
    {
        DB::table('cherry_stellar_invoices')->insert(['id' => $record['id'], 'company_id' => 'one', 'request_id' => $record['requestId'],
            'hash' => $record['hash'] ?? null, 'payload' => json_encode($record), 'created_at' => now(), 'updated_at' => now()]);
    }
    public function test_requires_login_feature_flag_permission_and_active_company(): void
    {
        $this->getJson('/stellar/api/invoices')->assertUnauthorized();
        $this->loginAs('one', false); $this->getJson('/stellar/api/invoices')->assertForbidden();
        $this->loginAs('one', true, true); $this->getJson('/stellar/api/invoices')->assertForbidden();
        $this->loginAs(); config(['cherry-stellar.enabled' => false]);
        $this->getJson('/stellar/api/invoices')->assertNotFound();
    }
    public function test_persists_server_quote_once_and_ignores_client_company(): void
    {
        $this->loginAs(); Http::fake(['127.0.0.1:3001/*' => Http::response($this->record())]);
        $this->postJson('/stellar/api/invoices', [...$this->input(), 'company_id' => 'two'])->assertOk();
        $this->postJson('/stellar/api/invoices', $this->input())->assertOk();
        $this->assertDatabaseCount('cherry_stellar_invoices', 1);
        $this->assertDatabaseHas('cherry_stellar_invoices', ['company_id' => 'one']);
        Http::assertSentCount(1);
    }
    public function test_company_cannot_read_or_mutate_another_company_invoice(): void
    {
        $this->insertRecord($this->record()); $this->loginAs('two');
        $this->getJson('/stellar/api/invoices')->assertExactJson([]);
        $this->postJson('/stellar/api/invoices/'.$this->record()['id'].'/confirm')->assertNotFound();
        Http::assertNothingSent();
    }
    public function test_signed_binding_is_immutable_and_unknown_settlement_is_retained(): void
    {
        $record = [...$this->record(), 'status' => 'prepared', 'xdr' => 'signed-demo', 'hash' => str_repeat('a', 64)];
        $this->insertRecord($record); $this->loginAs();
        $url = '/stellar/api/invoices/'.$record['id'];
        $this->postJson($url.'/prepare', ['xdr' => 'other'])->assertStatus(409);
        $this->postJson($url.'/prepare', ['xdr' => 'signed-demo'])->assertOk();
        Http::fake(['127.0.0.1:3001/*' => Http::response($record)]);
        $this->postJson($url.'/confirm')->assertOk()->assertJsonPath('status', 'prepared');
        $this->assertDatabaseCount('cherry_stellar_invoices', 1);
    }
    public function test_verifier_failure_does_not_change_payment_or_journal(): void
    {
        $record = [...$this->record(), 'status' => 'prepared', 'xdr' => 'signed-demo'];
        $this->insertRecord($record); $this->loginAs();
        Http::fake(['127.0.0.1:3001/*' => Http::response([], 503)]);
        $this->postJson('/stellar/api/invoices/'.$record['id'].'/confirm')->assertStatus(503);
        $saved = json_decode(DB::table('cherry_stellar_invoices')->value('payload'), true);
        $this->assertSame($record, $saved);
    }
    public function test_reconciles_once_using_saved_record_not_browser_payload(): void
    {
        $record = [...$this->record(), 'status' => 'prepared', 'xdr' => 'signed-demo'];
        $this->insertRecord($record); $this->loginAs();
        $result = [...$record, 'status' => 'reconciled', 'journal' => [['event' => 'Verified fixture']]];
        Http::fake(['127.0.0.1:3001/*' => Http::response($result)]);
        $url = '/stellar/api/invoices/'.$record['id'].'/confirm';
        $this->postJson($url, ['record' => ['company_id' => 'two']])->assertOk();
        $this->postJson($url)->assertOk()->assertJsonPath('status', 'reconciled');
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['record']['xdr'] === 'signed-demo');
    }
}
