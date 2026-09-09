@extends('layout.main')

@section('title', 'Cherry Stellar · Cherry Money')

@section('css')
<meta name="csrf-token" content="{{ csrf_token() }}">
<link rel="stylesheet" href="{{ asset('cherry-stellar/style.css') }}?v={{ filemtime(public_path('cherry-stellar/style.css')) }}">
@endsection

@section('content')
<div class="content-wrapper transition-all duration-150 ltr:ml-[248px] rtl:mr-[248px]" id="content_wrapper">
    <div class="page-content">
        <div class="transition-all duration-150 container-fluid" id="page_layout">
            <div id="content_layout">
                <section id="cherry-stellar" aria-label="Cherry Stellar payment workspace">
                    <div class="stellar-context">
                        <span>Cherry Pay / Cherry Stellar</span>
                        <span class="badge">TESTNET ONLY</span>
                    </div>
                    <aside class="notice">Sending a testnet payment also creates an unpaid draft purchase invoice in your Cherry Money company. It is marked TESTNET DEMO. Review it under Purchases; do not approve it as a real supplier bill.</aside>
                    @include('cherry-stellar.content')
                </section>
            </div>
        </div>
    </div>
</div>
@endsection

@section('js')
<script defer src="{{ asset('cherry-stellar/stellar-sdk.js') }}"></script>
<script defer src="{{ asset('cherry-stellar/adapter.js') }}?v={{ filemtime(public_path('cherry-stellar/adapter.js')) }}"></script>
<script defer src="{{ asset('cherry-stellar/app.js') }}?v={{ filemtime(public_path('cherry-stellar/app.js')) }}"></script>
@endsection
