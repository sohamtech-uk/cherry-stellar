<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('cherry_stellar_invoices', function (Blueprint $table) {
            $table->string('purchase_invoice_id', 64)->nullable()->unique();
        });
    }
    public function down(): void
    {
        Schema::table('cherry_stellar_invoices', function (Blueprint $table) {
            $table->dropUnique(['purchase_invoice_id']);
            $table->dropColumn('purchase_invoice_id');
        });
    }
};
