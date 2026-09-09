<?php

namespace App\CherryStellar;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;

class PurchaseInvoiceWriter
{
    public function createDraft(array $record): array
    {
        // Older base installations posted bills immediately. Require the approval workflow.
        abort_unless(Schema::hasTable('purchase_invoice_approval_events'), 503, 'Run Cherry Money purchase approval migrations before initiating a payment.');
        $user = Auth::user();
        abort_unless(in_array((string) $user->getCompany()->currency, ['GBP', '£'], true), 422,
            'This GBP demo requires a company with GBP as its accounting currency.');
        $number = 'STELLAR-TEST-'.$record['id'];
        $pence = $record['pence'];
        $amount = intdiv($pence, 100).'.'.str_pad((string) ($pence % 100), 2, '0', STR_PAD_LEFT);
        // Use the base model's normal draft creation, period guard and audit path.
        // Company/creator, approval and payment statuses are assigned by Cherry Money itself.
        $invoice = app('App\\Models\\PurchaseInvoice')->addNew([
            'supplier_name' => $record['supplier'],
            'invoice_no' => $number,
            'invoice_date' => now()->toDateString(),
            'amount' => $amount,
            'vat_amount' => 0,
            'vat_rate' => 0,
            'vat_recoverable' => 0,
            'vat_transaction_type' => 'no vat purchase',
            'payment_method' => 'Stellar testnet demo',
            'notes' => 'TESTNET DEMO — no real money or supplier liability verified. Do not approve or pay this draft as a real bill. '
                .'Stellar demo ID: '.$record['id'].'. Transaction: '.$record['hash'].'. '
                .'Illustrative GBP/CHUSD rate: '.$record['rate'].'. Simulated service fee: GBP '
                .number_format($record['feePence'] / 100, 2, '.', '').' (excluded from supplier principal). '
                .'Country: '.$record['country'].'. VAT is a demo placeholder requiring review for any real invoice.',
        ], 'add');
        abort_unless($invoice && (string) $invoice->company_id === (string) $user->company_id
            && $invoice->approval_status === 'draft' && $invoice->payment_status === 'unpaid', 503,
            'Cherry Money did not create an unpaid draft. Payment initiation has been rolled back.');
        return ['id' => (string) $invoice->id, 'number' => $number, 'createdAs' => 'draft', 'currency' => 'GBP'];
    }
}
