@php
    $cherryPayOpen = ($page === 'dashboard' && $sub_page === 'cherry-pay') || $page === 'stellar';
@endphp
<li class="sidebar-nav-group">
    <details @if($cherryPayOpen) open @endif>
        <summary class="navItem @if($cherryPayOpen) active @endif">
            <span class="flex items-center">
                <iconify-icon class="nav-icon" icon="mdi:qrcode-scan"></iconify-icon>
                <span>Cherry Pay</span>
            </span>
            <iconify-icon class="nav-chevron" icon="heroicons-outline:chevron-right"></iconify-icon>
        </summary>
        <div class="sidebar-nav-subnav">
            @if($hasSalesPermission)
                <a href="{{ url('dashboard/cherry-pay') }}" class="@if($page === 'dashboard' && $sub_page === 'cherry-pay') active @endif" @if($page === 'dashboard' && $sub_page === 'cherry-pay') aria-current="page" @endif>Overview</a>
            @endif
            <a href="{{ url('stellar') }}" class="@if($page === 'stellar') active @endif" @if($page === 'stellar') aria-current="page" @endif>Cherry Stellar</a>
        </div>
    </details>
</li>
