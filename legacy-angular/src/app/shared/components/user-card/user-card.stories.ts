import { Meta, StoryObj, applicationConfig, moduleMetadata } from '@storybook/angular';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { importProvidersFrom } from '@angular/core';
import { UserCardComponent } from './user-card.component';
import { User, UserCardMenuOption } from './user-card.interface';

/**
 * User Card Component Stories
 *
 * A reusable user card component that displays user information with interactive actions.
 */
const meta: Meta<UserCardComponent> = {
  title: 'Components/UserCard',
  component: UserCardComponent,
  decorators: [
    applicationConfig({
      providers: [importProvidersFrom(BrowserAnimationsModule)]
    }),
    moduleMetadata({
      imports: [UserCardComponent]
    })
  ],
  tags: ['autodocs'],
  argTypes: {
    user: {
      control: 'object',
      description: 'User data to display in the card'
    },
    menuOptions: {
      control: 'object',
      description: 'Custom menu options for the dropdown'
    },
    showSendEmail: {
      control: 'boolean',
      description: 'Show/hide send email action button'
    },
    showEditProfile: {
      control: 'boolean',
      description: 'Show/hide edit profile action button'
    },
    actionClick: {
      action: 'actionClick',
      description: 'Event emitted when any action is clicked'
    },
    cardClick: {
      action: 'cardClick',
      description: 'Event emitted when the card is clicked'
    }
  }
};

export default meta;
type Story = StoryObj<UserCardComponent>;

// Sample user data
const defaultUser: User = {
  id: 1,
  name: 'Dominik McNeail',
  avatar: 'images/user-64-01.jpg',
  country: 'Italy',
  countryFlag: '🇮🇹',
  bio: 'Fitness Fanatic, Design Enthusiast, Mentor, Meetup Organizer & PHP Lover.',
};

const defaultMenuOptions: UserCardMenuOption[] = [
  { label: 'Option 1', action: 'option1' },
  { label: 'Option 2', action: 'option2' },
  { label: 'Remove', action: 'remove', isDanger: true }
];

/**
 * Default user card with all features enabled
 */
export const Default: Story = {
  args: {
    user: defaultUser,
    menuOptions: defaultMenuOptions,
    showSendEmail: true,
    showEditProfile: true
  }
};

/**
 * User card without special badge
 */
export const WithoutBadge: Story = {
  args: {
    user: {
      ...defaultUser,
    },
    menuOptions: defaultMenuOptions,
    showSendEmail: true,
    showEditProfile: true
  }
};

/**
 * User card without bio
 */
export const WithoutBio: Story = {
  args: {
    user: {
      ...defaultUser,
      bio: ''
    },
    menuOptions: defaultMenuOptions,
    showSendEmail: true,
    showEditProfile: true
  }
};

/**
 * User card with only send email action
 */
export const SendEmailOnly: Story = {
  args: {
    user: defaultUser,
    menuOptions: defaultMenuOptions,
    showSendEmail: true,
    showEditProfile: false
  }
};

/**
 * User card with only edit profile action
 */
export const EditProfileOnly: Story = {
  args: {
    user: defaultUser,
    menuOptions: defaultMenuOptions,
    showSendEmail: false,
    showEditProfile: true
  }
};

/**
 * User card without action buttons
 */
export const NoActions: Story = {
  args: {
    user: defaultUser,
    menuOptions: defaultMenuOptions,
    showSendEmail: false,
    showEditProfile: false
  }
};

/**
 * User card with custom menu options
 */
export const CustomMenuOptions: Story = {
  args: {
    user: defaultUser,
    menuOptions: [
      { label: 'View Profile', action: 'view' },
      { label: 'Send Message', action: 'message' },
      { label: 'Add to Favorites', action: 'favorite' },
      { label: 'Share Profile', action: 'share' },
      { label: 'Block User', action: 'block', isDanger: true },
      { label: 'Report', action: 'report', isDanger: true }
    ],
    showSendEmail: true,
    showEditProfile: true
  }
};

/**
 * User card with long name and bio
 */
export const LongContent: Story = {
  args: {
    user: {
      ...defaultUser,
      name: 'Alexander Christopher Montgomery Wellington',
      bio: 'Passionate software engineer with over 10 years of experience in full-stack development, specializing in Angular, React, Node.js, and cloud architecture. Love mentoring junior developers and organizing community meetups.'
    },
    menuOptions: defaultMenuOptions,
    showSendEmail: true,
    showEditProfile: true
  }
};

/**
 * Multiple user cards in a grid
 */
export const GridLayout: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; padding: 1rem;">
        <app-user-card
          [user]="{
            id: 1,
            name: 'Dominik McNeail',
            avatar: 'images/user-64-01.jpg',
            country: 'Italy',
            countryFlag: '🇮🇹',
            bio: 'Fitness Fanatic, Design Enthusiast, Mentor, Meetup Organizer & PHP Lover.',
            hasSpecialBadge: true
          }"
          [menuOptions]="menuOptions"
          [showSendEmail]="showSendEmail"
          [showEditProfile]="showEditProfile"
          (actionClick)="actionClick($event)"
          (cardClick)="cardClick($event)"
        ></app-user-card>
        <app-user-card
          [user]="{
            id: 2,
            name: 'Ivan Mesaros',
            avatar: 'images/user-64-02.jpg',
            country: 'France',
            countryFlag: '🇫🇷',
            bio: 'Fitness Fanatic, Design Enthusiast, Mentor, Meetup Organizer & PHP Lover.',
            hasSpecialBadge: true
          }"
          [menuOptions]="menuOptions"
          [showSendEmail]="showSendEmail"
          [showEditProfile]="showEditProfile"
          (actionClick)="actionClick($event)"
          (cardClick)="cardClick($event)"
        ></app-user-card>
        <app-user-card
          [user]="{
            id: 3,
            name: 'Tisha Yanchev',
            avatar: 'images/user-64-03.jpg',
            country: 'Germany',
            countryFlag: '🇩🇪',
            bio: 'Fitness Fanatic, Design Enthusiast, Mentor, Meetup Organizer & PHP Lover.',
            hasSpecialBadge: true
          }"
          [menuOptions]="menuOptions"
          [showSendEmail]="showSendEmail"
          [showEditProfile]="showEditProfile"
          (actionClick)="actionClick($event)"
          (cardClick)="cardClick($event)"
        ></app-user-card>
      </div>
    `
  }),
  args: {
    menuOptions: defaultMenuOptions,
    showSendEmail: true,
    showEditProfile: true
  }
};

/**
 * Interactive example with event logging
 */
export const Interactive: Story = {
  args: {
    user: defaultUser,
    menuOptions: defaultMenuOptions,
    showSendEmail: true,
    showEditProfile: true
  },
  play: async ({ canvasElement }) => {
    // This function is called after the story renders
    // You can add interactions here for testing
    console.log('User card rendered:', canvasElement);
  }
};

/**
 * Different countries and flags
 */
export const DifferentCountries: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1.5rem; padding: 1rem;">
        <app-user-card
          [user]="{
            id: 1,
            name: 'John Smith',
            avatar: 'images/user-64-01.jpg',
            country: 'United States',
            countryFlag: '🇺🇸',
            bio: 'Software Engineer from Silicon Valley',
            hasSpecialBadge: true
          }"
          [menuOptions]="menuOptions"
          [showSendEmail]="showSendEmail"
          [showEditProfile]="showEditProfile"
        ></app-user-card>
        <app-user-card
          [user]="{
            id: 2,
            name: 'Sakura Tanaka',
            avatar: 'images/user-64-02.jpg',
            country: 'Japan',
            countryFlag: '🇯🇵',
            bio: 'UX Designer and Illustrator',
            hasSpecialBadge: false
          }"
          [menuOptions]="menuOptions"
          [showSendEmail]="showSendEmail"
          [showEditProfile]="showEditProfile"
        ></app-user-card>
        <app-user-card
          [user]="{
            id: 3,
            name: 'Lucas Silva',
            avatar: 'images/user-64-03.jpg',
            country: 'Brazil',
            countryFlag: '🇧🇷',
            bio: 'Full Stack Developer',
            hasSpecialBadge: true
          }"
          [menuOptions]="menuOptions"
          [showSendEmail]="showSendEmail"
          [showEditProfile]="showEditProfile"
        ></app-user-card>
        <app-user-card
          [user]="{
            id: 4,
            name: 'Emma Johnson',
            avatar: 'images/user-64-04.jpg',
            country: 'Australia',
            countryFlag: '🇦🇺',
            bio: 'Product Manager',
            hasSpecialBadge: false
          }"
          [menuOptions]="menuOptions"
          [showSendEmail]="showSendEmail"
          [showEditProfile]="showEditProfile"
        ></app-user-card>
      </div>
    `
  }),
  args: {
    menuOptions: defaultMenuOptions,
    showSendEmail: true,
    showEditProfile: true
  }
};

