/** "Booking requests" — bookings on the signed-in user's listings. */
import { CalendarRange } from "lucide-react";
import { Seo } from "@/components/Seo";
import { ButtonLink } from "@/components/ui";
import { PageHeader } from "@/components/dashboard/common";
import { BookingsList } from "@/components/dashboard/BookingsList";

export default function OwnerBookingsPage() {
  return (
    <div>
      <Seo title="Booking requests" noindex />
      <PageHeader
        title="Booking requests"
        subtitle="Respond quickly — fast replies rank your listings higher and win more rentals."
        action={<ButtonLink to="/dashboard/listings" variant="outline" icon={<CalendarRange className="h-4 w-4" />}>My listings</ButtonLink>}
      />
      <BookingsList role="owner" />
    </div>
  );
}
