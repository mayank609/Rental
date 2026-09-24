/** "My rentals" — bookings where the signed-in user is the renter. */
import { Search } from "lucide-react";
import { Seo } from "@/components/Seo";
import { ButtonLink } from "@/components/ui";
import { PageHeader } from "@/components/dashboard/common";
import { BookingsList } from "@/components/dashboard/BookingsList";

export default function RentalsPage() {
  return (
    <div>
      <Seo title="My rentals" noindex />
      <PageHeader
        title="My rentals"
        subtitle="Items you've requested or rented from others."
        action={<ButtonLink to="/search" variant="outline" icon={<Search className="h-4 w-4" />}>Find something to rent</ButtonLink>}
      />
      <BookingsList role="renter" />
    </div>
  );
}
