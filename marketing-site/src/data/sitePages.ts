import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '../../../src/constants/policyVersions';

export type Section = {
  heading: string;
  body?: string[];
  list?: string[];
};

export type SitePage = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  updated?: string;
  sections: Section[];
  contact?: 'general' | 'support' | 'both';
};

const updated = `Last updated: ${formatPolicyVersion(CURRENT_TERMS_VERSION)}`;
const privacyUpdated = `Last updated: ${formatPolicyVersion(CURRENT_PRIVACY_VERSION)}`;
const betaPaymentNotice = 'ReTail is not currently processing public marketplace payments. These policies describe the intended operation of future transaction features and may be updated before public payment services become available.';

export const pages: SitePage[] = [
  {
    slug: 'how-it-works',
    title: 'How ReTail Works | ReTail',
    description: 'Learn how ReTail helps people browse, sell, give away, and donate secondhand pet supplies during private beta.',
    eyebrow: 'Marketplace basics',
    heading: 'How ReTail works',
    intro: 'ReTail is being built as a focused marketplace for pet supplies, local coordination, and rescue support.',
    sections: [
      { heading: 'Browse', body: ['Browse pet supplies available near you and narrow the results by location, category, condition, listing type, price, or other filters.'] },
      { heading: 'Sell', body: ['Create a listing, set a price, add photos, and explain how buyers can receive the item.'] },
      { heading: 'Give away', body: ['Offer an item free to another ReTail user without classifying it as a rescue-specific donation.'] },
      { heading: 'Donate to a rescue', body: ['Offer an item specifically to verified animal rescue organizations. The donor chooses which requesting rescue receives the item.'] },
      { heading: 'Payments during private beta', body: ['Payment processing is not currently available during private beta. Any applicable marketplace or payment fees will be clearly disclosed before public transactions become available.'] },
    ],
    contact: 'general',
  },
  {
    slug: 'rescue-hub',
    title: 'Rescue Hub | ReTail',
    description: 'Learn how ReTail Rescue Hub is designed to show verified rescue profiles, urgent needs, wishlists, and rescue donation listings.',
    eyebrow: 'Rescue support',
    heading: 'Rescue Hub',
    intro: 'Rescue Hub is designed to help community members understand what nearby animal rescues need most.',
    sections: [
      { heading: 'Verified rescue profiles', body: ['ReTail is being built to support organization profiles for eligible rescue groups. Verification helps separate real rescue participation from ordinary user accounts.'] },
      { heading: 'Urgent supply needs', body: ['Rescues can identify high-priority supplies such as crates, carriers, bedding, food bowls, leashes, litter boxes, and other pet-supply needs.'] },
      { heading: 'Rescue wishlists', body: ['Wishlists are intended to give community members a clearer way to understand ongoing supply needs before contacting a rescue.'] },
      { heading: 'Available rescue donations', body: ['A Rescue Donation listing is different from a general free listing. Rescue Donation items are offered specifically to eligible verified rescue organizations.'] },
      { heading: 'Donation receipts and tax questions', body: ['ReTail does not determine whether a contribution is tax deductible. Donors should ask the receiving organization whether it can provide a donation receipt.'] },
      { heading: 'Before public launch', body: ['Rescues interested in future participation can contact ReTail. ReTail does not claim any specific rescue is already a partner unless that partnership is documented.'] },
    ],
    contact: 'general',
  },
  {
    slug: 'safety',
    title: 'Safety | ReTail',
    description: 'Review ReTail safety principles for pet-supply listings, reporting, local exchanges, and rescue donations.',
    eyebrow: 'Trust and safety',
    heading: 'Safety at ReTail',
    intro: 'ReTail is a pet-supply marketplace, not a live-animal marketplace or general classifieds service.',
    sections: [
      { heading: 'Pet supplies only', body: ['ReTail is for supplies such as crates, carriers, beds, toys, aquariums, terrariums, cages, grooming supplies, leashes, harnesses, and similar items.'] },
      { heading: 'Live animals are prohibited', body: ['Live animals may not be listed, sold, adopted, rehomed, fostered, traded, given away, or transferred through ReTail. Breeding and stud services are also prohibited.'] },
      { heading: 'Location privacy', body: ['ReTail public marketplace views should show general location information such as city, state, or approximate distance. Exact home addresses should not be displayed publicly.'] },
      { heading: 'Reporting', body: ['Users can report listings, messages, or accounts for spam, fraud, prohibited items, harassment, inappropriate content, duplicate listings, or unsafe behavior.'] },
      { heading: 'Meeting and delivery', body: ['Users are responsible for deciding whether, where, and how to meet, ship, or exchange an item. Meeting in safe public locations is encouraged when practical.'] },
    ],
    contact: 'support',
  },
  {
    slug: 'about',
    title: 'About ReTail | ReTail',
    description: 'Learn about ReTail, a private-beta secondhand pet-supply marketplace owned and operated by Crutchfield Interactive LLC.',
    eyebrow: 'About',
    heading: 'A marketplace built for pet supplies',
    intro: 'ReTail was created to help pet owners save money, reduce waste, and support animal rescues through a focused secondhand marketplace.',
    sections: [
      { heading: 'Why ReTail exists', body: ['Many useful pet supplies are outgrown, upgraded, duplicated, or no longer needed. ReTail gives those items a more focused place to be reused.'] },
      { heading: 'Rescue-aware by design', body: ['ReTail includes Rescue Hub and rescue-specific donation workflows so people can support verified animal rescues without turning the marketplace into a social network.'] },
      { heading: 'Company ownership', body: ['ReTail is owned and operated by Crutchfield Interactive LLC.'] },
      { heading: 'Current stage', body: ['ReTail is currently in private beta. Public marketplace access and payment services are not yet available.'] },
    ],
    contact: 'general',
  },
  {
    slug: 'contact',
    title: 'Contact ReTail | ReTail',
    description: 'Contact ReTail for general questions, rescue participation, support, account issues, safety reports, and future payment questions.',
    eyebrow: 'Contact',
    heading: 'Contact ReTail',
    intro: 'For the first public website, direct email links are preferred. ReTail does not use a public contact form that silently stores personal data.',
    sections: [
      { heading: 'General questions and partnerships', body: ['Use contact@retailpetapp.com for general business questions, rescue participation, partnerships, media or community inquiries, and public-launch questions.'] },
      { heading: 'Support and safety', body: ['Use support@retailpetapp.com for account issues, listing concerns, payment questions when payments become available, reports and safety concerns, and technical support.'] },
    ],
    contact: 'both',
  },
  {
    slug: 'private-beta',
    title: 'Private Beta | ReTail',
    description: 'ReTail is currently undergoing limited private beta testing before public marketplace access becomes available.',
    eyebrow: 'Private beta',
    heading: 'ReTail is currently in private beta',
    intro: 'ReTail is being tested with a limited group of users before its public launch. The marketplace is not yet open to the general public.',
    sections: [
      {
        heading: 'What private beta means',
        list: [
          'Features may change based on beta feedback.',
          'Payments are not yet publicly available.',
          'Beta data and test listings may be removed before launch.',
          'Beta participation does not guarantee continued access.',
          'Private APK links, EAS build URLs, test credentials, and beta passwords are not published on this website.',
        ],
      },
      { heading: 'Reporting issues', body: ['Beta users can report issues to support@retailpetapp.com. People interested in future access can contact ReTail for public-launch updates.'] },
    ],
    contact: 'both',
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy | ReTail',
    description: 'Read the ReTail privacy policy for account information, public listings, messaging, reports, notifications, and location privacy.',
    eyebrow: 'Policy',
    heading: 'Privacy Policy',
    intro: 'This Privacy Policy explains how ReTail, owned and operated by Crutchfield Interactive LLC, handles information needed to operate a pet-supply marketplace.',
    updated: privacyUpdated,
    sections: [
      {
        heading: 'Information ReTail collects',
        list: [
          'Account information, such as email address and authentication status.',
          'Policy acceptance history and current marketing email preference.',
          'Public profile information, such as display name, username, avatar, bio, city, and state.',
          'Listings, including titles, descriptions, photos, categories, condition, price or free status, and general location.',
          'Favorites, messages, reviews, reports, notification records, and account settings.',
          'Approximate location or search-area information used for marketplace discovery.',
          'Device tokens for push notifications.',
          'Analytics events, crash diagnostics, and basic device or app information when enabled.',
        ],
      },
      { heading: 'Public information', body: ['Listings, public profiles, review summaries, listing photos, city/state, approximate distance, and marketplace activity may be visible to other users. ReTail does not publicly display exact home addresses, private email addresses, authentication identifiers, or street-level GPS coordinates.'] },
      { heading: 'Messaging and safety records', body: ['Messages are intended for buyer, seller, and rescue coordination. Reports, moderation notes, account actions, and related records may be retained to investigate spam, fraud, harassment, prohibited listings, or unsafe behavior.'] },
      { heading: 'Marketing email preference', body: ['ReTail may use an account email for ReTail news, launch updates, tips, and promotions only according to the user’s current marketing email preference. Users can opt in or out in Settings. When marketing email launches, messages will also include an unsubscribe mechanism.', 'Marketing messages are separate from transactional, security, payment, account, notification, and other essential service communications. Opting out of marketing does not stop communications needed to operate or protect a ReTail account. ReTail is not currently sending marketing campaigns through this preference.'] },
      { heading: 'Account deletion', body: ['Users can request account deletion. When an account is deleted, profile information may be anonymized and active listings archived. Historical transaction, messaging, review, report, and moderation records may be retained when needed for safety, fraud prevention, audit history, or legal compliance.'] },
      { heading: 'Contact', body: ['General privacy questions can be sent to contact@retailpetapp.com. Account access or safety issues should be sent to support@retailpetapp.com.'] },
    ],
    contact: 'both',
  },
  {
    slug: 'terms',
    title: 'Terms of Service | ReTail',
    description: 'Read the ReTail Terms of Service for marketplace use, prohibited listings, local exchanges, reports, moderation, and account deletion.',
    eyebrow: 'Policy',
    heading: 'Terms of Service',
    intro: 'These Terms of Service apply to ReTail, a pet-supply marketplace owned and operated by Crutchfield Interactive LLC.',
    updated,
    sections: [
      { heading: 'Eligible users', body: ['Users must provide accurate account information and may not impersonate another person, organization, rescue, shelter, or business. Users are responsible for keeping login credentials secure and for activity that occurs through their account.'] },
      { heading: 'Marketplace use', body: ['Users may create listings for pet supplies they own or are authorized to sell or donate. Listings must include accurate titles, descriptions, photos, condition details, price or free/donation status, and general location.'] },
      { heading: 'Prohibited listings', body: ['Live animals, adoption or rehoming listings, breeding or stud services, prescription medications, controlled substances, recalled products, counterfeit products, stolen goods, hazardous chemicals, illegal items, adult content, hate speech, and unrelated services are prohibited.'] },
      { heading: 'Local exchanges', body: ['Users are responsible for arranging safe pickup, meetup, delivery, payment, or shipping details. ReTail does not guarantee item condition, availability, legality, or user behavior.'] },
      { heading: 'Reports and moderation', body: ['ReTail may remove listings, archive content, restrict accounts, preserve records, and investigate reports to protect the community.'] },
    ],
    contact: 'both',
  },
  {
    slug: 'community-guidelines',
    title: 'Community Guidelines | ReTail',
    description: 'Review ReTail community guidelines for honest listings, respectful messaging, safe exchanges, rescue support, and reporting.',
    eyebrow: 'Guidelines',
    heading: 'Community Guidelines',
    intro: 'ReTail exists to help pet owners reuse supplies, save money, reduce waste, and support safer local exchanges.',
    updated,
    sections: [
      { heading: 'Be honest', body: ['Use clear photos and accurate descriptions. Include the real condition, size, brand, flaws, missing parts, pickup details, and whether the item is for sale, free, or rescue donation.'] },
      { heading: 'Pet supplies only', body: ['Do not list live animals. This includes animals for sale, adoption, fostering, rehoming, breeding, stud services, trades, or giveaways.'] },
      { heading: 'Communicate respectfully', body: ['Do not harass, threaten, pressure, spam, scam, send offensive content, or repeatedly contact someone who does not want to continue.'] },
      { heading: 'Meet safely', body: ['Meet in public places when possible. Do not share exact home addresses publicly in listings. Inspect items before completing a transaction and use your judgment before meeting someone in person.'] },
      { heading: 'Support rescues responsibly', body: ['Rescues and volunteers may use ReTail to find or share supplies. Urgent needs and donations must still follow the pet-supplies-only rule. Live animals may not be listed or transferred through ReTail.'] },
    ],
    contact: 'support',
  },
  {
    slug: 'refunds-and-disputes',
    title: 'Refunds and Disputes | ReTail',
    description: 'Understand ReTail pre-launch payment language, future transaction disputes, outside payments, free items, and rescue donations.',
    eyebrow: 'Policy',
    heading: 'Refunds and Disputes',
    intro: betaPaymentNotice,
    updated,
    sections: [
      { heading: 'Future payments through ReTail', body: ['Future payment features may include payment-provider workflows, transaction records, and dispute handling. Final rules, timelines, and fees will be clearly disclosed before public transactions become available.'] },
      { heading: 'Payments arranged outside ReTail', body: ['If users choose to pay outside ReTail, those payments are arranged at their own discretion. ReTail does not claim that outside payments are protected by ReTail.'] },
      { heading: 'Free items', body: ['Free listings do not involve a ReTail-processed payment. Users should still communicate clearly about item condition, pickup, meetup, shipping, or timing.'] },
      { heading: 'Rescue donations', body: ['Rescue Donation listings are offered free to eligible verified rescue organizations. ReTail does not determine whether a contribution is tax deductible. Donors should ask the receiving organization whether it can provide a donation receipt.'] },
      { heading: 'Support', body: ['Payment questions, user issues, and safety concerns should be sent to support@retailpetapp.com.'] },
    ],
    contact: 'support',
  },
  {
    slug: 'shipping-and-fulfillment',
    title: 'Shipping and Fulfillment | ReTail',
    description: 'Review ReTail shipping and fulfillment guidance for pickup, meetup, shipping method, cost, packaging, address, timing, and condition.',
    eyebrow: 'Policy',
    heading: 'Shipping and Fulfillment',
    intro: betaPaymentNotice,
    updated,
    sections: [
      { heading: 'Current private beta', body: ['ReTail does not currently generate public shipping labels or provide public payment-backed shipping workflows. Users may discuss pickup, meetup, or shipping details through private messages.'] },
      {
        heading: 'User responsibilities',
        list: [
          'Confirm the shipping method.',
          'Agree on shipping cost before sending an item.',
          'Package the item appropriately.',
          'Confirm the delivery address privately and carefully.',
          'Agree on timing and handling expectations.',
          'Describe item condition accurately before shipment.',
        ],
      },
      { heading: 'Local pickup and meetup', body: ['Many ReTail exchanges may happen through porch pickup or meetup. Users should choose arrangements that feel safe and practical for the item.'] },
      { heading: 'Support', body: ['Shipping concerns and user issues should be sent to support@retailpetapp.com.'] },
    ],
    contact: 'support',
  },
  {
    slug: 'prohibited-items',
    title: 'Prohibited Items | ReTail',
    description: 'Review the ReTail prohibited-items policy, including live animals, rehoming listings, breeding services, medications, recalled products, and illegal items.',
    eyebrow: 'Policy',
    heading: 'Prohibited Items',
    intro: 'ReTail is for pet supplies only. The following items, services, and content are not allowed on ReTail.',
    updated,
    sections: [
      {
        heading: 'Not allowed',
        list: [
          'Live animals.',
          'Adoption or rehoming listings.',
          'Breeding or stud services.',
          'Prescription medications.',
          'Controlled substances.',
          'Recalled pet products.',
          'Stolen or counterfeit goods.',
          'Weapons or hazardous materials.',
          'Illegal items.',
          'Adult content or hate speech.',
          'Unrelated services.',
          'Other content prohibited by current ReTail rules.',
        ],
      },
      { heading: 'Pet supplies only', body: ['ReTail is not a platform for selling, adopting, fostering, trading, breeding, or transferring ownership of live animals. Users may report prohibited listings from inside the app or by contacting support.'] },
    ],
    contact: 'support',
  },
];

function formatPolicyVersion(version: string): string {
  const [year, month, day] = version.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
