'use client'


import React from 'react'
import {NAV_ITEMS} from "@/lib/constants";
import Link from "next/link";
import {usePathname} from "next/navigation";
import SearchCommand from "@/components/SearchCommand";

const NavItems = ({initialStocks}: { initialStocks: StockWithWatchlistStatus[]}) => {
    const pathname = usePathname()

    const isActive = (path: string) => {
        if (path ==='/') return pathname === '/'

        return  pathname.startsWith(path);
    }

    return (
        <ul className="flex flex-col gap-3 p-2 font-medium sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-4 sm:gap-y-1 sm:p-0 sm:text-[12px] xl:gap-x-5 xl:text-[13px]">
        {NAV_ITEMS.map(({href, label}) => {
            if (href === '/search') return (
                <li key="search-trigger">
                    <SearchCommand
                        renderAs="text"
                        label="Search"
                        initialStocks={initialStocks}
                    />
                </li>
            )
            return <li key={href}>
                <Link prefetch={false} href={href} className={`hover:text-teal-500 transition-colors ${isActive(href) ? 'text-gray-100' : ''}`}>
                    {label}
                </Link>
            </li>
        })}
    </ul>
    )
}
export default NavItems
