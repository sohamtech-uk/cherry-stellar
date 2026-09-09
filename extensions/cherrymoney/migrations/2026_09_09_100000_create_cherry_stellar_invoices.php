<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('cherry_stellar_invoices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('company_id', 64)->index();
            $table->uuid('request_id');
            $table->string('hash', 64)->nullable()->unique();
            $table->longText('payload');
            $table->timestamps();
            $table->unique(['company_id', 'request_id']);
        });
    }
    public function down(): void { Schema::dropIfExists('cherry_stellar_invoices'); }
};
